/**
 * Visual regression runner.
 *
 *   node test/visual/run.ts [options] [filter ...]
 *
 * Options:
 *   --update        Write the rendered frames as the new baselines.
 *   --gpu           Render on the machine's GPU instead of SwiftShader.
 *   --list          Print the scenario names and exit.
 *   --headed        Show the browser window (debugging).
 *   --audit         After running, report frames that are near-blank or
 *                   identical to their model's plain render (a scenario
 *                   whose effect changed nothing is probably mis-tuned).
 *   filter          Only run scenarios whose name contains one of the
 *                   given substrings (or matches a `/regex/`).
 *
 * Serves the repository through Vite, opens `test/visual/index.html` in a
 * headless Chromium and asks the page to render each scenario. Frames are
 * compared byte-for-byte against `test/visual/baselines/<name>.png`. Any
 * mismatch writes `<name>.actual.png` and `<name>.diff.png` into
 * `test/visual/output/` and fails the run.
 *
 * The default renderer is SwiftShader (Chromium's software rasterizer), so
 * baselines are reproducible across machines and CI. Comparing a GPU frame
 * against a SwiftShader baseline (or vice versa) is meaningless; the run
 * warns when the renderer differs from the one that produced the baselines.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createServer } from "vite";
import type {
	CaptureError,
	CaptureResult,
	HarnessApi,
	ScenarioInfo,
} from "./harness.ts";

declare global {
	interface Window {
		__visual: HarnessApi;
	}
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselineDir = join(root, "test/visual/baselines");
const outputDir = join(root, "test/visual/output");
const rendererFile = join(baselineDir, "renderer.txt");

interface Args {
	update: boolean;
	gpu: boolean;
	list: boolean;
	headed: boolean;
	audit: boolean;
	filters: string[];
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		update: false,
		gpu: false,
		list: false,
		headed: false,
		audit: false,
		filters: [],
	};
	for (const arg of argv) {
		if (arg === "--update" || arg === "-u") args.update = true;
		else if (arg === "--gpu") args.gpu = true;
		else if (arg === "--list") args.list = true;
		else if (arg === "--headed") args.headed = true;
		else if (arg === "--audit") args.audit = true;
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

function readPng(path: string): PNG {
	return PNG.sync.read(readFileSync(path));
}

function toPng(width: number, height: number, rgba: Uint8Array): PNG {
	const png = new PNG({ width, height });
	png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
	return png;
}

function writePng(path: string, png: PNG): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, PNG.sync.write(png));
}

interface Mismatch {
	reason: string;
	diff?: PNG;
}

/**
 * Compares two frames byte for byte. On mismatch, builds a three-panel diff
 * image (baseline | actual | changed pixels in red over a dimmed actual).
 */
function compare(expected: PNG, actual: PNG): Mismatch | null {
	if (expected.width !== actual.width || expected.height !== actual.height) {
		return {
			reason: `size ${actual.width}x${actual.height}, baseline ${expected.width}x${expected.height}`,
		};
	}

	const { width, height } = expected;
	const a = expected.data;
	const b = actual.data;
	let changed = 0;
	let maxDelta = 0;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;

	const diff = new PNG({ width: width * 3, height });
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const same =
				a[i] === b[i] &&
				a[i + 1] === b[i + 1] &&
				a[i + 2] === b[i + 2] &&
				a[i + 3] === b[i + 3];

			const e = (y * width * 3 + x) * 4;
			diff.data.set(a.subarray(i, i + 4), e);
			diff.data.set(b.subarray(i, i + 4), e + width * 4);

			const d = e + width * 8;
			if (same) {
				diff.data[d] = b[i] >> 2;
				diff.data[d + 1] = b[i + 1] >> 2;
				diff.data[d + 2] = b[i + 2] >> 2;
				diff.data[d + 3] = 255;
			} else {
				changed++;
				for (let c = 0; c < 4; c++) {
					maxDelta = Math.max(maxDelta, Math.abs(a[i + c] - b[i + c]));
				}
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
				diff.data[d] = 255;
				diff.data[d + 1] = 0;
				diff.data[d + 2] = 0;
				diff.data[d + 3] = 255;
			}
		}
	}

	if (changed === 0) return null;
	const pct = ((changed / (width * height)) * 100).toFixed(2);
	return {
		reason: `${changed} px (${pct}%) differ, max channel delta ${maxDelta}, box (${minX},${minY})-(${maxX},${maxY})`,
		diff,
	};
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

function distinctColors(png: PNG): number {
	const seen = new Set<number>();
	const d = png.data;
	for (let i = 0; i < d.length; i += 4) {
		seen.add(
			((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0,
		);
	}
	return seen.size;
}

/**
 * Flags captured frames that carry almost no information (fewer than four
 * distinct colors) or are byte-identical to the plain `core/model-<model>`
 * render, which means the scenario's settings changed nothing. The plain
 * render is taken from this run when it was captured, else from its baseline.
 */
function audit(
	scenarios: ScenarioInfo[],
	captured: Map<string, PNG>,
): string[] {
	const findings: string[] = [];
	for (const { name, model } of scenarios) {
		const png = captured.get(name);
		if (!png) continue;
		const baseName = `core/model-${model}`;
		if (name === baseName) continue;

		const colors = distinctColors(png);
		if (colors < 4) {
			findings.push(`${name}: only ${colors} distinct color(s)`);
			continue;
		}

		let base = captured.get(baseName);
		const basePath = join(baselineDir, `${baseName}.png`);
		if (!base && existsSync(basePath)) base = readPng(basePath);
		if (base && sameBytes(base.data, png.data)) {
			findings.push(`${name}: identical to ${baseName}`);
		}
	}
	return findings;
}

async function listBaselines(): Promise<string[]> {
	if (!existsSync(baselineDir)) return [];
	const entries = await readdir(baselineDir, {
		recursive: true,
		withFileTypes: true,
	});
	return entries
		.filter((e) => e.isFile() && e.name.endsWith(".png"))
		.map((e) =>
			relative(baselineDir, join(e.parentPath, e.name))
				.replaceAll("\\", "/")
				.replace(/\.png$/, ""),
		)
		.sort();
}

async function main(): Promise<number> {
	const args = parseArgs(process.argv.slice(2));

	const server = await createServer({
		configFile: join(root, "vite.config.ts"),
		root,
		mode: "test",
		logLevel: "error",
		server: { port: 5199, strictPort: false, host: "127.0.0.1", open: false },
	});
	await server.listen();
	const url = server.resolvedUrls?.local[0];
	if (!url) throw new Error("Vite did not report a local URL");

	const swiftShader = [
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
		"--ignore-gpu-blocklist",
	];
	const gpu = [
		"--ignore-gpu-blocklist",
		"--use-gl=angle",
		"--use-angle=default",
	];
	const browser = await chromium.launch({
		headless: !args.headed,
		args: args.gpu ? gpu : swiftShader,
	});

	try {
		const page = await browser.newPage();
		page.on("console", (msg) => {
			if (msg.type() === "error" || msg.type() === "warning") {
				console.log(`  [browser ${msg.type()}] ${msg.text()}`);
			}
		});
		page.on("pageerror", (err) => console.log(`  [page error] ${err.message}`));

		await page.goto(`${url}test/visual/index.html`);
		await page.waitForFunction(
			() => typeof window.__visual === "object",
			null,
			{
				timeout: 30_000,
			},
		);

		const renderer = await page.evaluate(() => window.__visual.renderer());
		const scenarios = await page.evaluate(() => window.__visual.list());
		const all = scenarios.map((s) => s.name);
		const selected = scenarios.filter((s) =>
			matchesFilter(s.name, args.filters),
		);

		if (args.list) {
			for (const s of selected) console.log(s.name);
			return 0;
		}

		console.log(`Renderer: ${renderer}`);
		console.log(`Browser:  Chromium ${browser.version()}`);
		if (existsSync(rendererFile) && !args.update) {
			const baselineRenderer = readFileSync(rendererFile, "utf8").trim();
			if (baselineRenderer !== renderer) {
				console.log(
					`WARNING: baselines were captured on a different renderer:\n          ${baselineRenderer}`,
				);
			}
		}
		console.log(
			`Running ${selected.length} of ${all.length} scenarios${args.update ? " (updating baselines)" : ""}\n`,
		);

		if (!args.update) rmSync(outputDir, { recursive: true, force: true });

		let passed = 0;
		let updated = 0;
		const failures: string[] = [];
		const captured = new Map<string, PNG>();
		const startAll = performance.now();

		for (const { name } of selected) {
			const result = (await page.evaluate(
				(n) => window.__visual.render(n),
				name,
			)) as CaptureResult | CaptureError;

			if ("error" in result) {
				failures.push(`${name}: ${result.error}`);
				console.log(
					`  ERROR  ${name}\n         ${result.error.split("\n")[0]}`,
				);
				continue;
			}

			const rgba = new Uint8Array(Buffer.from(result.pixels, "base64"));
			const actual = toPng(result.width, result.height, rgba);
			const baselinePath = join(baselineDir, `${name}.png`);
			const ms = result.ms.toFixed(0).padStart(5);
			if (args.audit) captured.set(name, actual);

			if (args.update) {
				writePng(baselinePath, actual);
				updated++;
				console.log(`  WROTE  ${name} (${ms} ms)`);
				continue;
			}

			if (!existsSync(baselinePath)) {
				writePng(join(outputDir, `${name}.actual.png`), actual);
				failures.push(`${name}: no baseline (run with --update to create it)`);
				console.log(`  NEW    ${name} (${ms} ms) — no baseline`);
				continue;
			}

			const mismatch = compare(readPng(baselinePath), actual);
			if (!mismatch) {
				passed++;
				console.log(`  ok     ${name} (${ms} ms)`);
				continue;
			}

			writePng(join(outputDir, `${name}.actual.png`), actual);
			if (mismatch.diff)
				writePng(join(outputDir, `${name}.diff.png`), mismatch.diff);
			failures.push(`${name}: ${mismatch.reason}`);
			console.log(`  FAIL   ${name} (${ms} ms)\n         ${mismatch.reason}`);
		}

		const seconds = ((performance.now() - startAll) / 1000).toFixed(1);
		console.log("");

		if (args.update) {
			mkdirSync(baselineDir, { recursive: true });
			writeFileSync(rendererFile, `${renderer}\n`);
			console.log(`Updated ${updated} baseline(s) in ${seconds}s.`);
		} else {
			console.log(
				`${passed} passed, ${failures.length} failed in ${seconds}s.`,
			);
		}

		if (args.audit) {
			const findings = audit(selected, captured);
			if (findings.length > 0) {
				console.log(
					`\nAudit: ${findings.length} scenario(s) look ineffective:`,
				);
				for (const f of findings) console.log(`  ${f}`);
			} else {
				console.log(
					"\nAudit: every scenario differs from its plain model render.",
				);
			}
		}

		if (args.filters.length === 0) {
			const orphans = (await listBaselines()).filter((n) => !all.includes(n));
			if (orphans.length > 0) {
				console.log(
					`\n${orphans.length} baseline(s) have no scenario (delete or rename):`,
				);
				for (const o of orphans) console.log(`  ${o}`);
			}
		}

		if (failures.length > 0) {
			console.log(`\nFailures:\n${failures.map((f) => `  ${f}`).join("\n")}`);
			if (!args.update) {
				console.log(
					`\nActual frames and diffs written to ${relative(root, outputDir)}/`,
				);
			}
			return 1;
		}
		return 0;
	} finally {
		await browser.close();
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
