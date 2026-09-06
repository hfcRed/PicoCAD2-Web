/**
 * Browser side of the performance pipeline.
 *
 * Loaded by `run.ts` through the Vite dev server. Exposes `window.__perf`,
 * which imports library builds as separate modules (each with its own
 * shared context) and measures a scenario on a build. Builds are only
 * known by their public API, and the API differences between versions are
 * absorbed here, so one catalogue measures every build.
 *
 * Every measurement drives the viewer clock through `advanceTime()` and
 * draws through `draw()`, never through the render loop, except for the
 * `loop` mode, which measures the library's own loop.
 *
 * What a frames measurement reports:
 * - `cpu`: the main-thread time of `draw()`, which includes the GL command
 *   submission and the capture to the viewer's canvas.
 * - `gpu`: the GPU time of the same frames from timer queries, when the
 *   context provides them.
 * - `frame`: `draw()` followed by a one-pixel readback, which waits for
 *   the GPU to finish the frame. Chromium implements WebGL's `finish()` as
 *   a flush, so a readback is the only sync that actually drains. Measured
 *   on separate frames so the sync never perturbs the `cpu` numbers.
 * - `allocPerFrame`: bytes of JS heap growth per frame, with the garbage
 *   collector forced beforehand, so it is the allocation rate of a frame.
 * - `firstDrawMs`: the first draw after the load, which compiles the lazily
 *   compiled effect programs and allocates the framebuffers.
 */

import {
	type LegacyExtras,
	type ModelName,
	type PerfScenario,
	type PerfSettings,
	SCENARIOS,
} from "./scenarios.ts";

export interface Distribution {
	median: number;
	p90: number;
	min: number;
	mean: number;
	count: number;
}

export interface FramesResult {
	kind: "frames";
	supported: true;
	loadMs: number;
	setupMs: number;
	firstDrawMs: number;
	/** Time from the first draw until every program was ready, when the build reports readiness. */
	readyMs: number | null;
	cpu: Distribution;
	gpu: Distribution | null;
	frame: Distribution;
	allocPerFrame: number | null;
	drawCalls: number;
	polyCount: number;
	modelPolys: number;
}

export interface CompileResult {
	kind: "compile";
	supported: true;
	contextMs: number;
	loadMs: number;
	setupMs: number;
	firstDrawMs: number;
	secondDrawMs: number;
	blockingMs: number;
	/** Time from the first draw until every program was ready, when the build reports readiness. */
	readyMs: number | null;
}

export interface LoopResult {
	kind: "loop";
	supported: true;
	fps: number;
	busyPerFrameMs: number;
	frames: number;
}

export interface Unsupported {
	supported: false;
	reason: string;
}

export type RunResult = FramesResult | CompileResult | LoopResult | Unsupported;

export interface RunOptions {
	frames: number;
	warmup: number;
	maxMs: number;
	loopMs: number;
}

export interface BuildInfo {
	name: string;
	renderer: string | null;
	contextMs: number | null;
	version: string;
}

export interface ScenarioInfo {
	name: string;
	model: ModelName;
	mode: string;
}

export interface HarnessApi {
	/**
	 * Imports a build. With `createContext` the build's shared context is
	 * created right away, which compiles the startup programs; a compile
	 * measurement passes false so its own fresh context pays that cost.
	 */
	loadBuild(
		name: string,
		url: string,
		createContext: boolean,
	): Promise<BuildInfo>;
	list(): ScenarioInfo[];
	run(build: string, scenario: string, options: RunOptions): Promise<RunResult>;
}

declare global {
	interface Window {
		__perf: HarnessApi;
		gc?: () => void;
	}
}

interface LibStats {
	drawCalls: number;
	polyCount: number;
}

interface LibContext {
	gl: WebGL2RenderingContext;
	canvas: OffscreenCanvas;
	stats: LibStats;
	dispose(): void;
}

interface LibAnimation {
	play(): void;
	pause(): void;
	time: number;
}

interface LibViewer {
	load(source: string, useBookmark?: boolean): void;
	draw(syncWithAnimation?: boolean): void;
	advanceTime(dt: number): void;
	dispose(): void;
	startRenderLoop(syncWithAnimation?: boolean): void;
	stopRenderLoop(): void;
	extras: Record<string, Record<string, unknown> | undefined>;
	animation: LibAnimation;
	modelInfo: { polyCount: number } | null;
	onFrame: ((dt: number) => void) | null;
	whenReady?: () => Promise<void>;
	[key: string]: unknown;
}

interface LibModule {
	PicoCAD2Context: new () => LibContext;
	PicoCAD2Viewer: new (options: Record<string, unknown>) => LibViewer;
	COMPATIBLE_VERSION?: string;
}

interface LoadedBuild {
	name: string;
	module: LibModule;
	context: LibContext | null;
	timer: GpuTimer | null;
}

interface SharedContext {
	context: LibContext;
	timer: GpuTimer;
}

/** The build's shared context, created on first use. */
function sharedContext(build: LoadedBuild): SharedContext {
	if (!build.context || !build.timer) {
		build.context = new build.module.PicoCAD2Context();
		build.timer = new GpuTimer(build.context.gl);
	}
	return { context: build.context, timer: build.timer };
}

interface TimerQueryExt {
	TIME_ELAPSED_EXT: number;
	GPU_DISJOINT_EXT: number;
}

interface HeapMemory {
	usedJSHeapSize: number;
}

const FRAME_DT = 1 / 60;

/** How long to wait for the GPU to deliver the sample pass's timer queries. */
const QUERY_DEADLINE_MS = 30_000;

const syncPixel = new Uint8Array(4);

/**
 * Waits for the GPU to finish everything queued so far. Chromium's
 * `finish()` only flushes, a readback has to wait for the result.
 *
 * @param gl - The WebGL 2 rendering context.
 */
function drainGpu(gl: WebGL2RenderingContext): void {
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
}

const builds = new Map<string, LoadedBuild>();
const modelCache = new Map<ModelName, Promise<string>>();
const scenarioByName = new Map<string, PerfScenario>();

for (const scenario of SCENARIOS) {
	if (scenarioByName.has(scenario.name)) {
		throw new Error(`Duplicate scenario name: ${scenario.name}`);
	}
	scenarioByName.set(scenario.name, scenario);
}

function fetchModel(name: ModelName): Promise<string> {
	let pending = modelCache.get(name);
	if (!pending) {
		pending = fetch(`/src/example-models/${name}.txt`).then((res) => {
			if (!res.ok) throw new Error(`Failed to fetch model ${name}`);
			return res.text();
		});
		modelCache.set(name, pending);
	}
	return pending;
}

function yieldTask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function distribution(values: number[]): Distribution {
	const sorted = [...values].sort((a, b) => a - b);
	const n = sorted.length;
	if (n === 0) return { median: 0, p90: 0, min: 0, mean: 0, count: 0 };
	let sum = 0;
	for (const v of sorted) sum += v;
	return {
		median: sorted[Math.floor((n - 1) / 2)],
		p90: sorted[Math.floor(0.9 * (n - 1))],
		min: sorted[0],
		mean: sum / n,
		count: n,
	};
}

/**
 * Wraps the disjoint timer query extension. One query brackets each frame
 * and the results are read back once the GPU has finished them all.
 */
class GpuTimer {
	private readonly gl: WebGL2RenderingContext;
	private readonly ext: TimerQueryExt | null;
	private readonly queries: WebGLQuery[] = [];

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.ext = gl.getExtension(
			"EXT_disjoint_timer_query_webgl2",
		) as TimerQueryExt | null;
	}

	get available(): boolean {
		return this.ext !== null;
	}

	begin(): void {
		if (!this.ext) return;
		const query = this.gl.createQuery();
		if (!query) return;
		this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
		this.queries.push(query);
	}

	end(): void {
		if (!this.ext) return;
		this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
	}

	/**
	 * Reads every pending query in milliseconds. Returns null when the
	 * extension is missing, the results never arrived, or the GPU clock was
	 * disjoint during the measurement.
	 */
	async collect(): Promise<number[] | null> {
		const gl = this.gl;
		const ext = this.ext;
		const queries = this.queries.splice(0);
		if (!ext) return null;

		drainGpu(gl);
		const deadline = performance.now() + QUERY_DEADLINE_MS;
		const values: number[] = [];
		let timedOut = false;
		for (const query of queries) {
			while (
				!timedOut &&
				!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
			) {
				if (performance.now() > deadline) {
					timedOut = true;
					break;
				}
				await yieldTask();
			}
			if (!timedOut) {
				values.push(
					(gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6,
				);
			}
			gl.deleteQuery(query);
		}

		if (timedOut) return null;
		if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return null;
		return values;
	}
}

function rendererString(gl: WebGL2RenderingContext): string {
	const info = gl.getExtension("WEBGL_debug_renderer_info");
	const renderer = info
		? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
		: String(gl.getParameter(gl.RENDERER));
	return `${renderer} | ${gl.getParameter(gl.VERSION)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Writes effect settings onto an effect instance. Nested groups merge
 * into the instance's own group objects, arrays are copied.
 */
function assignEffect(target: Record<string, unknown>, source: unknown): void {
	if (!isRecord(source)) return;
	for (const key of Object.keys(source)) {
		const value = source[key];
		const current = target[key];
		if (isRecord(value) && isRecord(current)) {
			assignEffect(current, value);
		} else if (Array.isArray(value)) {
			target[key] = [...value];
		} else {
			target[key] = value;
		}
	}
}

/**
 * Picks the effect settings a build can take: the scenario's own when the
 * build has every effect they name, else the legacy settings when it has
 * those, else nothing, which marks the scenario unsupported on the build.
 */
function pickExtras(
	viewer: LibViewer,
	scenario: PerfScenario,
): Record<string, unknown> | null {
	const candidates: (Record<string, unknown> | LegacyExtras | undefined)[] = [
		scenario.extras as Record<string, unknown> | undefined,
		scenario.legacyExtras,
	];
	for (const candidate of candidates) {
		if (!candidate) continue;
		if (Object.keys(candidate).every((key) => viewer.extras[key])) {
			return candidate;
		}
	}
	return scenario.extras ? null : {};
}

/**
 * Applies the scenario's viewer settings in the build's vocabulary. Returns
 * why the build cannot run the scenario, or null when it can.
 */
function applySettings(
	viewer: LibViewer,
	settings: PerfSettings | undefined,
): string | null {
	const s = settings ?? {};

	// The example files carry camera modes, tags and animation flags. Pin
	// them so the workload depends only on the scenario.
	viewer.cameraMode = s.cameraMode ?? "fixed";
	viewer.leftTag = null;
	viewer.rightTag = null;
	viewer.scanlines = s.scanlines ?? false;
	viewer.animation.time = s.animationTime ?? 0;
	if (s.animate) {
		viewer.animation.play();
	} else {
		viewer.animation.pause();
	}

	if (s.shading !== undefined) {
		if ("shadingMode" in viewer) {
			viewer.shadingMode = s.shading ? 1 : 0;
		} else {
			viewer.shading = s.shading;
		}
	}
	if (s.renderMode !== undefined) {
		if (typeof viewer.renderMode === "number") {
			viewer.renderMode = { none: 0, color: 1, texture: 2 }[s.renderMode];
		} else {
			viewer.renderMode = s.renderMode;
		}
	}
	if (s.projectionMode !== undefined) viewer.projectionMode = s.projectionMode;
	if (s.backgroundColor !== undefined) {
		viewer.backgroundColor = s.backgroundColor;
	}
	if (s.outlineSize !== undefined) viewer.outlineSize = s.outlineSize;
	if (s.outlineColor !== undefined) viewer.outlineColor = s.outlineColor;

	if (s.transparency !== undefined) {
		if (!("transparency" in viewer)) return "no transparency setting";
		viewer.transparency = s.transparency;
	}
	if ("clampCameraDistance" in viewer) {
		viewer.clampCameraDistance = {
			enabled: s.clampCameraDistance ?? false,
			minimumDistance: 0,
		};
	} else if (s.clampCameraDistance) {
		return "no camera distance clamp";
	}
	if ("maxFps" in viewer) viewer.maxFps = 0;
	return null;
}

interface Prepared {
	viewers: LibViewer[];
	loadMs: number;
	setupMs: number;
	modelPolys: number;
}

/**
 * Creates the scenario's viewers on a context, loads their models and
 * applies the settings and effects. Returns the reason when the build
 * cannot run the scenario, with every viewer disposed again.
 */
async function prepare(
	module: LibModule,
	context: LibContext,
	scenario: PerfScenario,
): Promise<Prepared | Unsupported> {
	const count = scenario.viewers ?? 1;
	const modelNames: ModelName[] = [];
	const allModels: ModelName[] = [
		"rig",
		"pig",
		"livingroom",
		"helicopter_takeoff",
		"pirate",
		"waterfall",
		"advanced_meshes",
	];
	for (let i = 0; i < count; i++) {
		modelNames.push(
			i === 0
				? scenario.model
				: allModels[(allModels.indexOf(scenario.model) + i) % allModels.length],
		);
	}
	const sources = await Promise.all(modelNames.map(fetchModel));

	const resolution = scenario.resolution ?? { width: 128, height: 128 };
	const viewers: LibViewer[] = [];
	let loadMs = 0;
	let setupMs = 0;
	let modelPolys = 0;

	const fail = (reason: string): Unsupported => {
		for (const viewer of viewers) viewer.dispose();
		return { supported: false, reason };
	};

	for (let i = 0; i < count; i++) {
		const t0 = performance.now();
		const viewer = new module.PicoCAD2Viewer({
			canvas: document.createElement("canvas"),
			context,
			resolution: {
				width: resolution.width,
				height: resolution.height,
				scale: resolution.scale ?? 1,
			},
		});
		viewers.push(viewer);

		const t1 = performance.now();
		viewer.load(sources[i]);
		const t2 = performance.now();
		loadMs += t2 - t1;
		modelPolys += viewer.modelInfo?.polyCount ?? 0;

		const settingsProblem = applySettings(viewer, scenario.settings);
		if (settingsProblem) return fail(settingsProblem);

		const extras = pickExtras(viewer, scenario);
		if (!extras) {
			const missing = Object.keys(scenario.extras ?? {}).filter(
				(key) => !viewer.extras[key],
			);
			return fail(`no ${missing.join(", ")} effect`);
		}
		for (const key of Object.keys(extras)) {
			const effect = viewer.extras[key];
			if (effect) assignEffect(effect, extras[key]);
		}
		setupMs += performance.now() - t0 - (t2 - t1);
	}

	return { viewers, loadMs, setupMs, modelPolys };
}

function drawAll(viewers: LibViewer[]): void {
	for (const viewer of viewers) viewer.draw();
}

function stepAll(viewers: LibViewer[]): void {
	for (const viewer of viewers) viewer.advanceTime(FRAME_DT);
}

function heapUsed(): number | null {
	const memory = (performance as unknown as { memory?: HeapMemory }).memory;
	return memory ? memory.usedJSHeapSize : null;
}

/**
 * Waits until every viewer's programs are ready, for builds that compile
 * in the background. Returns the wait in milliseconds, or null for builds
 * without the readiness API, whose compiles blocked in the draw already.
 */
async function awaitReady(viewers: LibViewer[]): Promise<number | null> {
	if (viewers.some((viewer) => typeof viewer.whenReady !== "function")) {
		return null;
	}
	const start = performance.now();
	for (const viewer of viewers) await viewer.whenReady?.();
	return performance.now() - start;
}

async function runFrames(
	build: LoadedBuild,
	scenario: PerfScenario,
	options: RunOptions,
): Promise<RunResult> {
	const { context, timer } = sharedContext(build);
	const prepared = await prepare(build.module, context, scenario);
	if ("supported" in prepared) return prepared;
	const { viewers } = prepared;
	const gl = context.gl;

	try {
		const t0 = performance.now();
		drawAll(viewers);
		const firstDrawMs = performance.now() - t0;
		const readyMs = await awaitReady(viewers);

		for (let i = 0; i < options.warmup; i++) {
			stepAll(viewers);
			drawAll(viewers);
		}

		// The sample pass. The timer query brackets the whole frame, so with
		// several viewers it holds all their draws like the CPU number does.
		// The queue is drained first, so no earlier work backs the frames
		// up. On a software rasterizer the frames outrun the GPU process
		// regardless and the main-thread number then includes the wait.
		drainGpu(gl);
		window.gc?.();
		const cpu: number[] = [];
		const budgetEnd = performance.now() + options.maxMs;
		for (let i = 0; i < options.frames; i++) {
			if (i >= 10 && performance.now() > budgetEnd) break;
			stepAll(viewers);
			const start = performance.now();
			timer.begin();
			drawAll(viewers);
			timer.end();
			cpu.push(performance.now() - start);
		}
		const gpuValues = await timer.collect();

		// The drained-frame pass, on its own frames so the sync never lands
		// inside a cpu sample.
		const frame: number[] = [];
		const frameCount = Math.max(10, Math.floor(cpu.length / 2));
		const frameEnd = performance.now() + options.maxMs / 2;
		for (let i = 0; i < frameCount; i++) {
			if (i >= 5 && performance.now() > frameEnd) break;
			stepAll(viewers);
			const start = performance.now();
			drawAll(viewers);
			drainGpu(gl);
			frame.push(performance.now() - start);
		}

		// The allocation pass. A collection during the pass shows as a heap
		// drop, in which case the pass is retried with fewer frames.
		let allocPerFrame: number | null = null;
		if (window.gc && heapUsed() !== null) {
			let allocFrames = Math.max(10, Math.min(cpu.length, 60));
			for (let attempt = 0; attempt < 3 && allocPerFrame === null; attempt++) {
				window.gc();
				const before = heapUsed() ?? 0;
				for (let i = 0; i < allocFrames; i++) {
					stepAll(viewers);
					drawAll(viewers);
				}
				const after = heapUsed() ?? 0;
				if (after >= before) {
					allocPerFrame = (after - before) / allocFrames;
				} else {
					allocFrames = Math.max(5, Math.floor(allocFrames / 2));
				}
			}
		}

		// Drain the queue so the next measurement on this context starts
		// without this one's backlog.
		drainGpu(gl);
		const error = gl.getError();
		if (error !== gl.NO_ERROR) {
			throw new Error(`WebGL error after frames: 0x${error.toString(16)}`);
		}

		const stats = context.stats;
		return {
			kind: "frames",
			supported: true,
			loadMs: prepared.loadMs,
			setupMs: prepared.setupMs,
			firstDrawMs,
			readyMs,
			cpu: distribution(cpu),
			gpu: gpuValues ? distribution(gpuValues) : null,
			frame: distribution(frame),
			allocPerFrame,
			drawCalls: stats.drawCalls * viewers.length,
			polyCount: stats.polyCount * viewers.length,
			modelPolys: prepared.modelPolys,
		};
	} finally {
		for (const viewer of viewers) viewer.dispose();
	}
}

/**
 * Measures a first load on a fresh context, which is what a page pays on
 * the main thread before its first frame appears: the context's startup
 * shader compiles, the model load, and the first draw with the lazily
 * compiled effect programs. The context is lost afterwards so the page
 * never runs into the browser's context limit.
 */
async function runCompile(
	build: LoadedBuild,
	scenario: PerfScenario,
): Promise<RunResult> {
	const t0 = performance.now();
	const context = new build.module.PicoCAD2Context();
	const contextMs = performance.now() - t0;

	try {
		const prepared = await prepare(build.module, context, scenario);
		if ("supported" in prepared) return prepared;
		const { viewers } = prepared;

		try {
			const t1 = performance.now();
			drawAll(viewers);
			const firstDrawMs = performance.now() - t1;
			const readyMs = await awaitReady(viewers);
			const t2 = performance.now();
			stepAll(viewers);
			drawAll(viewers);
			const secondDrawMs = performance.now() - t2;

			return {
				kind: "compile",
				supported: true,
				contextMs,
				loadMs: prepared.loadMs,
				setupMs: prepared.setupMs,
				firstDrawMs,
				secondDrawMs,
				blockingMs:
					contextMs + prepared.loadMs + prepared.setupMs + firstDrawMs,
				readyMs,
			};
		} finally {
			for (const viewer of viewers) viewer.dispose();
		}
	} finally {
		context.dispose();
		const lose = context.gl.getExtension("WEBGL_lose_context");
		lose?.loseContext();
	}
}

/**
 * Runs the library's own render loop for a while. The animation frame
 * callbacks are timed from outside, so the number covers whatever the
 * build does per frame, including the capture and the present.
 */
async function runLoop(
	build: LoadedBuild,
	scenario: PerfScenario,
	options: RunOptions,
): Promise<RunResult> {
	const { context } = sharedContext(build);
	const prepared = await prepare(build.module, context, scenario);
	if ("supported" in prepared) return prepared;
	const { viewers } = prepared;

	const originalRaf = window.requestAnimationFrame;
	let busy = 0;
	let frames = 0;
	let counting = false;
	window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
		originalRaf.call(window, (time: number) => {
			const start = performance.now();
			callback(time);
			if (counting) busy += performance.now() - start;
		});

	try {
		viewers[0].onFrame = () => {
			if (counting) frames++;
		};
		for (const viewer of viewers) viewer.startRenderLoop();

		await sleep(Math.min(500, options.loopMs / 2));
		counting = true;
		const start = performance.now();
		await sleep(options.loopMs);
		counting = false;
		const seconds = (performance.now() - start) / 1000;

		for (const viewer of viewers) viewer.stopRenderLoop();
		return {
			kind: "loop",
			supported: true,
			fps: frames / seconds,
			busyPerFrameMs: frames > 0 ? busy / frames : 0,
			frames,
		};
	} finally {
		window.requestAnimationFrame = originalRaf;
		for (const viewer of viewers) viewer.dispose();
	}
}

window.__perf = {
	async loadBuild(name, url, createContext) {
		const module = (await import(/* @vite-ignore */ url)) as LibModule;
		const build: LoadedBuild = { name, module, context: null, timer: null };
		builds.set(name, build);

		let contextMs: number | null = null;
		if (createContext) {
			const t0 = performance.now();
			sharedContext(build);
			contextMs = performance.now() - t0;
		}
		return {
			name,
			renderer: build.context ? rendererString(build.context.gl) : null,
			contextMs,
			version: module.COMPATIBLE_VERSION ?? "unknown",
		};
	},
	list: () =>
		SCENARIOS.map((s) => ({
			name: s.name,
			model: s.model,
			mode: s.mode ?? "frames",
		})),
	async run(buildName, scenarioName, options) {
		const build = builds.get(buildName);
		if (!build)
			return { supported: false, reason: `unknown build ${buildName}` };
		const scenario = scenarioByName.get(scenarioName);
		if (!scenario) {
			return { supported: false, reason: `unknown scenario ${scenarioName}` };
		}
		if (scenario.mode === "compile") return runCompile(build, scenario);
		if (scenario.mode === "loop") return runLoop(build, scenario, options);
		return runFrames(build, scenario, options);
	},
};
