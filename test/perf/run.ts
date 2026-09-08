/**
 * Performance runner.
 *
 *   node test/perf/run.ts [options] [filter ...]
 *
 * Options:
 *   --builds a,b,c    Builds to measure (default: 1.3.0,base,dist). `dist` is
 *                     the working tree's bundle, rebuilt first unless
 *                     --no-build. `src` is the unbundled source served by
 *                     Vite, readable in a profile. Any other name is a
 *                     snapshot under test/perf/builds/<name>/ (snapshot.ts).
 *   --ref name        The build the ratios are relative to (default: the
 *                     last build, so ratios read as "this build over each
 *                     other build").
 *   --device name     gpu (default) or swiftshader, the software rasterizer
 *                     that stands in for a device without a usable GPU.
 *   --cpu N           Slow the page's main thread N times through DevTools,
 *                     emulating a weaker CPU (default: 1).
 *   --repeat N        Interleaved repetitions per scenario (default: 2).
 *   --frames N        Sample frames per measurement (default: 120), within
 *                     the --max-ms budget.
 *   --max-ms N        Time budget per measurement in ms (default: 2000).
 *   --loop-ms N       Duration of a loop scenario in ms (default: 2000).
 *   --profile name    Record a CPU profile of the named build's runs and
 *                     print the functions with the most self time.
 *   --alloc name      Record a sampling heap profile of the named build's
 *                     runs and print the functions allocating the most.
 *   --label name      Name of the results file (default: a timestamp).
 *   --md path         Also write the tables as Markdown.
 *   --no-build        Skip rebuilding dist.
 *   --no-save         Skip writing test/perf/results/<label>.json.
 *   --list            Print the scenario names and exit.
 *   --headed          Show the browser window.
 *   filter            Only run scenarios whose name contains one of the
 *                     given substrings (or matches a `/regex/`).
 *
 * Frames and loop scenarios share one browser: every build loads into the
 * same page as its own module with its own shared context. Per repetition,
 * every scenario runs on every build in turn, so drift affects the builds
 * alike. A cell is the median over the repetitions of each run's median.
 *
 * Compile scenarios each get a fresh browser, because the GPU process
 * caches compiled programs by source and a warm cache turns a four second
 * compile into a millisecond. Only a new GPU process compiles cold.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type CDPSession, chromium, type Page } from "playwright";
import { createServer } from "vite";
import type {
	BuildInfo,
	CompileResult,
	FramesResult,
	HarnessApi,
	LoopResult,
	RunOptions,
	RunResult,
	ScenarioInfo,
} from "./harness.ts";

declare global {
	interface Window {
		__perf: HarnessApi;
	}
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const buildsDir = join(root, "test/perf/builds");
const resultsDir = join(root, "test/perf/results");

interface Args {
	builds: string[];
	ref: string | null;
	device: "gpu" | "swiftshader";
	cpu: number;
	repeat: number;
	frames: number;
	maxMs: number;
	loopMs: number;
	profile: string | null;
	alloc: string | null;
	label: string | null;
	md: string | null;
	build: boolean;
	save: boolean;
	list: boolean;
	headed: boolean;
	filters: string[];
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		builds: ["1.3.0", "base", "dist"],
		ref: null,
		device: "gpu",
		cpu: 1,
		repeat: 2,
		frames: 120,
		maxMs: 2000,
		loopMs: 2000,
		profile: null,
		alloc: null,
		label: null,
		md: null,
		build: true,
		save: true,
		list: false,
		headed: false,
		filters: [],
	};

	const takeValue = (index: number, name: string): string => {
		const value = argv[index + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`${name} needs a value`);
		}
		return value;
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--builds") {
			args.builds = takeValue(i++, arg).split(",").filter(Boolean);
		} else if (arg === "--ref") args.ref = takeValue(i++, arg);
		else if (arg === "--device") {
			const device = takeValue(i++, arg);
			if (device !== "gpu" && device !== "swiftshader") {
				throw new Error(`Unknown device ${device}`);
			}
			args.device = device;
		} else if (arg === "--cpu") args.cpu = Number(takeValue(i++, arg));
		else if (arg === "--repeat") args.repeat = Number(takeValue(i++, arg));
		else if (arg === "--frames") args.frames = Number(takeValue(i++, arg));
		else if (arg === "--max-ms") args.maxMs = Number(takeValue(i++, arg));
		else if (arg === "--loop-ms") args.loopMs = Number(takeValue(i++, arg));
		else if (arg === "--profile") args.profile = takeValue(i++, arg);
		else if (arg === "--alloc") args.alloc = takeValue(i++, arg);
		else if (arg === "--label") args.label = takeValue(i++, arg);
		else if (arg === "--md") args.md = takeValue(i++, arg);
		else if (arg === "--no-build") args.build = false;
		else if (arg === "--no-save") args.save = false;
		else if (arg === "--list") args.list = true;
		else if (arg === "--headed") args.headed = true;
		else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
		else args.filters.push(arg);
	}
	return args;
}

function matchesFilter(name: string, filters: string[]): boolean {
	if (filters.length === 0) return true;
	return filters.some((f) => {
		const m = /^\/(.*)\/$/.exec(f);
		return m ? new RegExp(m[1]).test(name) : name.includes(f);
	});
}

interface BuildSpec {
	name: string;
	url: string;
	source: string;
}

interface SnapshotMeta {
	source: string;
}

function resolveBuild(name: string, build: boolean): BuildSpec {
	if (name === "src") {
		return { name, url: "/lib/main.ts", source: "lib/ served by Vite" };
	}
	if (name === "dist") {
		if (build) {
			console.log("Building dist...");
			execFileSync("pnpm", ["build"], {
				cwd: root,
				stdio: ["ignore", "ignore", "inherit"],
				shell: process.platform === "win32",
			});
		}
		if (!existsSync(join(root, "dist/main.js"))) {
			throw new Error("dist/main.js does not exist, run pnpm build");
		}
		return { name, url: "/dist/main.js", source: "dist/main.js" };
	}
	const dir = join(buildsDir, name);
	if (!existsSync(join(dir, "main.js"))) {
		throw new Error(
			`No snapshot named ${name}. Create it with node test/perf/snapshot.ts ${name} --npm <version> | --ref <git-ref> | --dist`,
		);
	}
	const metaPath = join(dir, "meta.json");
	const meta = existsSync(metaPath)
		? (JSON.parse(readFileSync(metaPath, "utf8")) as SnapshotMeta)
		: { source: "snapshot" };
	return {
		name,
		url: `/test/perf/builds/${name}/main.js`,
		source: meta.source,
	};
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)];
}

/** One scenario's aggregated numbers on one build. */
interface Cell {
	cpu?: number;
	gpu?: number | null;
	frame?: number;
	firstDraw?: number;
	ready?: number | null;
	alloc?: number | null;
	drawCalls?: number;
	contextMs?: number;
	loadMs?: number;
	blockingMs?: number;
	fps?: number;
	busy?: number;
	unsupported?: string;
}

function aggregate(runs: RunResult[]): Cell {
	const supported = runs.filter((r) => r.supported);
	if (supported.length === 0) {
		const first = runs[0];
		return {
			unsupported: first && !first.supported ? first.reason : "no runs",
		};
	}
	const kind = (supported[0] as FramesResult | CompileResult | LoopResult).kind;
	if (kind === "frames") {
		const frames = supported as FramesResult[];
		const gpus = frames.map((r) => r.gpu).filter((g) => g !== null);
		const allocs = frames
			.map((r) => r.allocPerFrame)
			.filter((a): a is number => a !== null);
		const readies = frames
			.map((r) => r.readyMs)
			.filter((m): m is number => m !== null);
		return {
			cpu: median(frames.map((r) => r.cpu.median)),
			gpu: gpus.length > 0 ? median(gpus.map((g) => g.median)) : null,
			frame: median(frames.map((r) => r.frame.median)),
			firstDraw: median(frames.map((r) => r.firstDrawMs)),
			ready: readies.length > 0 ? median(readies) : null,
			alloc: allocs.length > 0 ? median(allocs) : null,
			drawCalls: frames[0].drawCalls,
		};
	}
	if (kind === "compile") {
		const compiles = supported as CompileResult[];
		const readies = compiles
			.map((r) => r.readyMs)
			.filter((m): m is number => m !== null);
		return {
			contextMs: median(compiles.map((r) => r.contextMs)),
			loadMs: median(compiles.map((r) => r.loadMs)),
			firstDraw: median(compiles.map((r) => r.firstDrawMs)),
			blockingMs: median(compiles.map((r) => r.blockingMs)),
			ready: readies.length > 0 ? median(readies) : null,
		};
	}
	const loops = supported as LoopResult[];
	return {
		fps: median(loops.map((r) => r.fps)),
		busy: median(loops.map((r) => r.busyPerFrameMs)),
	};
}

function fmt(value: number | null | undefined, digits = 2): string {
	if (value === null || value === undefined) return "-";
	return value.toFixed(digits);
}

function fmtKb(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined) return "-";
	return `${(bytes / 1024).toFixed(1)}k`;
}

function ratio(value: number | undefined, ref: number | undefined): string {
	if (value === undefined || ref === undefined || ref === 0) return "-";
	return `${(value / ref).toFixed(2)}x`;
}

function geometricMean(values: number[]): number | null {
	if (values.length === 0) return null;
	let sum = 0;
	for (const v of values) sum += Math.log(v);
	return Math.exp(sum / values.length);
}

interface Table {
	title: string;
	header: string[];
	rows: string[][];
}

function renderTable(table: Table, markdown: boolean): string {
	const widths = table.header.map((h, i) =>
		Math.max(h.length, ...table.rows.map((r) => r[i]?.length ?? 0)),
	);
	const line = (cells: string[]): string =>
		cells
			.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i])))
			.join(markdown ? " | " : "  ");
	const lines = [
		markdown ? `### ${table.title}` : table.title,
		"",
		markdown ? `| ${line(table.header)} |` : line(table.header),
	];
	if (markdown) {
		lines.push(
			`| ${widths.map((w, i) => (i === 0 ? "-".repeat(w) : `${"-".repeat(w - 1)}:`)).join(" | ")} |`,
		);
	} else {
		lines.push(widths.map((w) => "-".repeat(w)).join("  "));
	}
	for (const row of table.rows) {
		lines.push(markdown ? `| ${line(row)} |` : line(row));
	}
	lines.push("");
	return lines.join("\n");
}

interface ScenarioRecord {
	scenario: ScenarioInfo;
	cells: Map<string, Cell>;
	runs: Map<string, RunResult[]>;
}

/**
 * Builds the frames table: per build the main-thread and GPU milliseconds
 * per frame, then the main-thread ratio of the reference build over every
 * other build. A footer row carries the geometric mean of the ratios over
 * the scenarios every build supports.
 */
function framesTable(
	records: ScenarioRecord[],
	builds: string[],
	ref: string,
): Table {
	const others = builds.filter((b) => b !== ref);
	const header = [
		"scenario",
		...builds.map((b) => `${b} cpu/gpu ms`),
		...others.map((b) => `${ref}/${b}`),
	];
	const rows: string[][] = [];
	const ratios = new Map<string, number[]>(others.map((b) => [b, []]));

	for (const record of records) {
		const cells = builds.map((b) => record.cells.get(b) ?? {});
		const refCell = record.cells.get(ref) ?? {};
		const row = [
			record.scenario.name,
			...cells.map((c) =>
				c.unsupported ? "n/a" : `${fmt(c.cpu)}/${fmt(c.gpu)}`,
			),
		];
		for (const other of others) {
			const cell = record.cells.get(other) ?? {};
			row.push(ratio(refCell.cpu, cell.cpu));
			if (refCell.cpu !== undefined && cell.cpu !== undefined && cell.cpu > 0) {
				ratios.get(other)?.push(refCell.cpu / cell.cpu);
			}
		}
		rows.push(row);
	}

	if (records.length > 1) {
		rows.push([
			"geometric mean of cpu ratios",
			...builds.map(() => ""),
			...others.map((b) => {
				const mean = geometricMean(ratios.get(b) ?? []);
				return mean === null ? "-" : `${mean.toFixed(2)}x`;
			}),
		]);
	}
	return { title: "Frames (ms per frame, lower is better)", header, rows };
}

function detailTable(records: ScenarioRecord[], builds: string[]): Table {
	return {
		title:
			"Frame detail (frame ms with the GPU drained by a readback, KB allocated per frame, draw calls)",
		header: ["scenario", ...builds.map((b) => `${b} drained/alloc/draws`)],
		rows: records.map((record) => [
			record.scenario.name,
			...builds.map((b) => {
				const cell = record.cells.get(b) ?? {};
				if (cell.unsupported) return "n/a";
				return `${fmt(cell.frame)}/${fmtKb(cell.alloc)}/${cell.drawCalls ?? "-"}`;
			}),
		]),
	};
}

function firstDrawTable(records: ScenarioRecord[], builds: string[]): Table {
	return {
		title:
			"First draw after load (ms blocking, then ms until background compiles were ready; warm program cache)",
		header: ["scenario", ...builds.map((b) => `${b} first draw / ready`)],
		rows: records.map((record) => [
			record.scenario.name,
			...builds.map((b) => {
				const cell = record.cells.get(b) ?? {};
				if (cell.unsupported) return "n/a";
				return `${fmt(cell.firstDraw, 1)} / ${fmt(cell.ready, 0)}`;
			}),
		]),
	};
}

function compileTable(records: ScenarioRecord[], builds: string[]): Table {
	return {
		title:
			"First load in a fresh browser (ms blocking the main thread: context + load + first draw = total, then ms until background compiles were ready)",
		header: [
			"scenario",
			...builds.map((b) => `${b} ctx/load/draw = total / ready`),
		],
		rows: records.map((record) => [
			record.scenario.name,
			...builds.map((b) => {
				const cell = record.cells.get(b) ?? {};
				if (cell.unsupported) return "n/a";
				return `${fmt(cell.contextMs, 0)}/${fmt(cell.loadMs, 0)}/${fmt(cell.firstDraw, 0)} = ${fmt(cell.blockingMs, 0)} / ${fmt(cell.ready, 0)}`;
			}),
		]),
	};
}

function loopTable(records: ScenarioRecord[], builds: string[]): Table {
	return {
		title: "Render loop (fps reached, main-thread ms per frame)",
		header: ["scenario", ...builds.map((b) => `${b} fps / busy ms`)],
		rows: records.map((record) => [
			record.scenario.name,
			...builds.map((b) => {
				const cell = record.cells.get(b) ?? {};
				if (cell.unsupported) return "n/a";
				return `${fmt(cell.fps, 0)} / ${fmt(cell.busy)}`;
			}),
		]),
	};
}

interface CallFrame {
	functionName: string;
	url: string;
	lineNumber: number;
}

interface ProfileNode {
	id: number;
	callFrame: CallFrame;
}

interface Profile {
	nodes: ProfileNode[];
	samples: number[];
	timeDeltas: number[];
}

interface HeapProfileNode {
	callFrame: CallFrame;
	selfSize: number;
	children: HeapProfileNode[];
}

interface HeapProfile {
	head: HeapProfileNode;
}

function frameKey(frame: CallFrame): string {
	const file = frame.url
		? frame.url.replace(/^.*\/(lib|test|node_modules)\//, "$1/")
		: "";
	return `${frame.functionName || "(anonymous)"} ${file}:${frame.lineNumber + 1}`;
}

/** Sums the sampled self time per function and prints the top entries. */
function printProfile(profile: Profile, label: string): void {
	const byId = new Map(profile.nodes.map((n) => [n.id, n]));
	const selfTime = new Map<string, number>();
	let total = 0;
	for (let i = 0; i < profile.samples.length; i++) {
		const node = byId.get(profile.samples[i]);
		const delta = profile.timeDeltas[i] ?? 0;
		if (!node || delta <= 0) continue;
		total += delta;
		const key = frameKey(node.callFrame);
		selfTime.set(key, (selfTime.get(key) ?? 0) + delta);
	}
	const top = [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
	console.log(
		`\nProfile ${label} (self time, ${(total / 1000).toFixed(0)} ms sampled):`,
	);
	for (const [key, micros] of top) {
		console.log(
			`  ${((micros / total) * 100).toFixed(1).padStart(5)}%  ${(micros / 1000).toFixed(1).padStart(7)} ms  ${key}`,
		);
	}
}

/** Sums the sampled allocation size per function and prints the top entries. */
function printHeapProfile(profile: HeapProfile, label: string): void {
	const selfSize = new Map<string, number>();
	let total = 0;
	const walk = (node: HeapProfileNode): void => {
		if (node.selfSize > 0) {
			total += node.selfSize;
			const key = frameKey(node.callFrame);
			selfSize.set(key, (selfSize.get(key) ?? 0) + node.selfSize);
		}
		for (const child of node.children) walk(child);
	};
	walk(profile.head);
	const top = [...selfSize.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
	console.log(
		`\nAllocations ${label} (sampled self size, ${(total / 1024).toFixed(0)} KB total):`,
	);
	for (const [key, bytes] of top) {
		console.log(
			`  ${((bytes / total) * 100).toFixed(1).padStart(5)}%  ${(bytes / 1024).toFixed(1).padStart(8)} KB  ${key}`,
		);
	}
}

interface Session {
	browser: Browser;
	page: Page;
	cdp: CDPSession;
}

/**
 * Launches a browser on the device profile, opens the harness page and
 * applies the CPU throttle. A fresh launch means a fresh GPU process with
 * an empty program cache.
 */
async function openSession(url: string, args: Args): Promise<Session> {
	const deviceFlags = {
		swiftshader: [
			"--use-angle=swiftshader",
			"--enable-unsafe-swiftshader",
			"--ignore-gpu-blocklist",
		],
		gpu: ["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=default"],
	};
	const browser = await chromium.launch({
		headless: !args.headed,
		args: [
			...deviceFlags[args.device],
			"--enable-precise-memory-info",
			"--js-flags=--expose-gc",
			"--disable-gpu-shader-disk-cache",
		],
	});
	const page = await browser.newPage();
	page.on("console", (msg) => {
		if (msg.type() === "error" || msg.type() === "warning") {
			console.log(`  [browser ${msg.type()}] ${msg.text()}`);
		}
	});
	page.on("pageerror", (err) => console.log(`  [page error] ${err.message}`));

	await page.goto(`${url}test/perf/index.html`);
	await page.waitForFunction(() => typeof window.__perf === "object", null, {
		timeout: 30_000,
	});

	const cdp = await page.context().newCDPSession(page);
	if (args.cpu !== 1) {
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: args.cpu });
	}
	return { browser, page, cdp };
}

function loadBuild(
	page: Page,
	spec: BuildSpec,
	createContext: boolean,
): Promise<BuildInfo> {
	return page.evaluate(
		({ name, url, createContext }) =>
			window.__perf.loadBuild(name, url, createContext),
		{ name: spec.name, url: spec.url, createContext },
	);
}

async function runOne(
	page: Page,
	build: string,
	scenario: string,
	options: RunOptions,
): Promise<RunResult> {
	try {
		return await page.evaluate(
			({ build, scenario, options }) =>
				window.__perf.run(build, scenario, options),
			{ build, scenario, options },
		);
	} catch (err) {
		return {
			supported: false,
			reason: err instanceof Error ? err.message.split("\n")[0] : String(err),
		};
	}
}

function summarize(result: RunResult): string {
	if (!result.supported) return `n/a (${result.reason})`;
	if (result.kind === "frames") {
		return `${fmt(result.cpu.median)}/${result.gpu ? fmt(result.gpu.median) : "-"} ms`;
	}
	if (result.kind === "compile") {
		return `${fmt(result.blockingMs, 0)} ms${result.readyMs !== null ? ` (+${fmt(result.readyMs, 0)} ready)` : ""}`;
	}
	return `${fmt(result.fps, 0)} fps ${fmt(result.busyPerFrameMs)} ms`;
}

async function main(): Promise<number> {
	const args = parseArgs(process.argv.slice(2));
	if (args.builds.length === 0) throw new Error("No builds given");
	const ref = args.ref ?? args.builds[args.builds.length - 1];
	if (!args.builds.includes(ref)) {
		throw new Error(`--ref ${ref} is not one of the builds`);
	}
	for (const name of [args.profile, args.alloc]) {
		if (name && !args.builds.includes(name)) {
			throw new Error(`${name} is not one of the builds`);
		}
	}

	const specs = args.builds.map((name) =>
		resolveBuild(name, args.build && !args.list),
	);

	const server = await createServer({
		configFile: join(root, "vite.config.ts"),
		root,
		mode: "test",
		logLevel: "error",
		server: {
			port: 5198,
			strictPort: false,
			host: "127.0.0.1",
			open: false,
			// Cross-origin isolation gives performance.now() 5 µs resolution
			// instead of 100 µs.
			headers: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp",
			},
		},
	});
	await server.listen();
	const url = server.resolvedUrls?.local[0];
	if (!url) throw new Error("Vite did not report a local URL");

	let shared: Session | null = null;
	try {
		shared = await openSession(url, args);
		const { page, cdp, browser } = shared;

		const scenarios = await page.evaluate(() => window.__perf.list());
		const selected = scenarios.filter((s) =>
			matchesFilter(s.name, args.filters),
		);
		if (args.list) {
			for (const s of selected) console.log(`${s.name} (${s.mode})`);
			return 0;
		}

		const infos: BuildInfo[] = [];
		for (const spec of specs) {
			const info = await loadBuild(page, spec, true);
			infos.push(info);
			console.log(
				`Build ${info.name.padEnd(10)} ${spec.source} (compatible with PicoCAD ${info.version}, context created in ${fmt(info.contextMs, 0)} ms)`,
			);
		}
		const renderer = infos[0].renderer ?? "unknown";
		console.log(`Renderer: ${renderer}`);
		console.log(
			`Browser:  Chromium ${browser.version()}, ${args.device}, CPU throttle ${args.cpu}x, ${args.repeat} repetition(s), up to ${args.frames} frames within ${args.maxMs} ms\n`,
		);

		const options: RunOptions = {
			frames: args.frames,
			warmup: 10,
			maxMs: args.maxMs,
			loopMs: args.loopMs,
		};
		const records: ScenarioRecord[] = selected.map((scenario) => ({
			scenario,
			cells: new Map(),
			runs: new Map(args.builds.map((b) => [b, []])),
		}));
		const sharedRecords = records.filter((r) => r.scenario.mode !== "compile");
		const compileRecords = records.filter((r) => r.scenario.mode === "compile");

		const startAll = performance.now();
		for (let rep = 0; rep < args.repeat; rep++) {
			for (const record of sharedRecords) {
				const name = record.scenario.name;
				const parts: string[] = [];
				for (const build of args.builds) {
					const profiling = args.profile === build && rep === 0;
					if (profiling) {
						await cdp.send("Profiler.enable");
						await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
						await cdp.send("Profiler.start");
					}
					const allocProfiling = args.alloc === build && rep === 0;
					if (allocProfiling) {
						await cdp.send("HeapProfiler.enable");
						await cdp.send("HeapProfiler.startSampling", {
							samplingInterval: 256,
						});
					}
					const result = await runOne(page, build, name, options);
					if (profiling) {
						const { profile } = (await cdp.send("Profiler.stop")) as {
							profile: Profile;
						};
						await cdp.send("Profiler.disable");
						printProfile(profile, `${build} ${name}`);
					}
					if (allocProfiling) {
						const { profile } = (await cdp.send(
							"HeapProfiler.stopSampling",
						)) as { profile: HeapProfile };
						await cdp.send("HeapProfiler.disable");
						printHeapProfile(profile, `${build} ${name}`);
					}
					record.runs.get(build)?.push(result);
					parts.push(`${build} ${summarize(result)}`);
				}
				console.log(
					`  ${rep + 1}/${args.repeat} ${name.padEnd(40)} ${parts.join("   ")}`,
				);
			}
		}

		// Compile scenarios: a fresh browser per measurement, so every
		// program compiles cold. The build is imported without a context.
		for (let rep = 0; rep < args.repeat; rep++) {
			for (const record of compileRecords) {
				const name = record.scenario.name;
				const parts: string[] = [];
				for (const spec of specs) {
					const session = await openSession(url, args);
					try {
						await loadBuild(session.page, spec, false);
						const result = await runOne(session.page, spec.name, name, options);
						record.runs.get(spec.name)?.push(result);
						parts.push(`${spec.name} ${summarize(result)}`);
					} finally {
						await session.browser.close();
					}
				}
				console.log(
					`  ${rep + 1}/${args.repeat} ${name.padEnd(40)} ${parts.join("   ")}`,
				);
			}
		}
		const seconds = ((performance.now() - startAll) / 1000).toFixed(0);

		for (const record of records) {
			for (const build of args.builds) {
				record.cells.set(build, aggregate(record.runs.get(build) ?? []));
			}
		}

		const frames = records.filter((r) => r.scenario.mode === "frames");
		const loops = records.filter((r) => r.scenario.mode === "loop");
		const tables: Table[] = [];
		if (frames.length > 0) {
			tables.push(framesTable(frames, args.builds, ref));
			tables.push(detailTable(frames, args.builds));
			tables.push(firstDrawTable(frames, args.builds));
		}
		if (compileRecords.length > 0) {
			tables.push(compileTable(compileRecords, args.builds));
		}
		if (loops.length > 0) tables.push(loopTable(loops, args.builds));

		console.log("");
		for (const table of tables) console.log(renderTable(table, false));
		console.log(`Finished in ${seconds}s.`);

		const meta = {
			date: new Date().toISOString(),
			device: args.device,
			cpuThrottle: args.cpu,
			renderer,
			chromium: browser.version(),
			builds: specs.map((spec, i) => ({ ...spec, ...infos[i] })),
			options: { ...options, repeat: args.repeat },
			ref,
		};
		if (args.save) {
			mkdirSync(resultsDir, { recursive: true });
			const label =
				args.label ??
				`${meta.date.replace(/[:.]/g, "-").slice(0, 19)}-${args.device}-cpu${args.cpu}`;
			const path = join(resultsDir, `${label}.json`);
			writeFileSync(
				path,
				JSON.stringify(
					{
						meta,
						results: records.map((r) => ({
							scenario: r.scenario,
							cells: Object.fromEntries(r.cells),
							runs: Object.fromEntries(r.runs),
						})),
					},
					null,
					"\t",
				),
			);
			console.log(`Results written to ${relative(root, path)}`);
		}
		if (args.md) {
			const header = [
				`# Performance ${meta.date.slice(0, 10)}`,
				"",
				`Renderer: ${meta.renderer}  `,
				`Device: ${args.device}, CPU throttle: ${args.cpu}x, repetitions: ${args.repeat}  `,
				...meta.builds.map((b) => `Build \`${b.name}\`: ${b.source}  `),
				"",
			];
			writeFileSync(
				args.md,
				`${header.join("\n")}\n${tables.map((t) => renderTable(t, true)).join("\n")}`,
			);
			console.log(`Markdown written to ${args.md}`);
		}
		return 0;
	} finally {
		await shared?.browser.close();
		await server.close();
	}
}

main().then(
	(code) => process.exit(code),
	(err) => {
		console.error(err);
		process.exit(2);
	},
);
