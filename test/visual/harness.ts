/**
 * Browser side of the visual regression pipeline.
 *
 * Loaded by `run.ts` through the Vite dev server. Exposes `window.__visual`,
 * which renders a named scenario into a fresh viewer and hands the raw RGBA
 * bytes of the presented canvas back to the runner. Every scenario runs on
 * its own viewer (and its own post-process pipeline) so nothing leaks between
 * captures. Only the WebGL context and compiled programs are shared.
 *
 * Nothing here advances on wall-clock time. The viewer clock is driven
 * exclusively through `advanceTime()`, the animation is paused and pinned
 * to the scenario's pose time, and the camera is set directly.
 *
 * Extras go through the constructor, before the model loads, so every effect
 * scenario doubles as proof that `load()` keeps the configured effects.
 * Settings are applied after the load, which overwrites them from the
 * model's export settings.
 */

import { PicoCAD2Context, PicoCAD2Viewer } from "../../lib/main.ts";
import { type ModelName, SCENARIOS, type Scenario } from "./scenarios.ts";

export interface CaptureResult {
	width: number;
	height: number;
	pixels: string;
	ms: number;
}

export interface CaptureError {
	error: string;
}

export interface ScenarioInfo {
	name: string;
	model: ModelName;
}

export interface HarnessApi {
	list(): ScenarioInfo[];
	renderer(): string;
	render(name: string): Promise<CaptureResult | CaptureError>;
}

declare global {
	interface Window {
		__visual: HarnessApi;
	}
}

const context = new PicoCAD2Context();
const modelCache = new Map<ModelName, Promise<string>>();
const scenarioByName = new Map<string, Scenario>();

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

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function glErrorName(gl: WebGL2RenderingContext, code: number): string {
	for (const key of Object.keys(WebGL2RenderingContext.prototype)) {
		const value = (gl as unknown as Record<string, unknown>)[key];
		if (value === code && /^[A-Z_]+$/.test(key)) return key;
	}
	return `0x${code.toString(16)}`;
}

async function capture(scenario: Scenario): Promise<CaptureResult> {
	const start = performance.now();
	const source = await fetchModel(scenario.model);
	const resolution = scenario.resolution ?? { width: 128, height: 128 };
	const canvas = document.createElement("canvas");

	const viewer = new PicoCAD2Viewer({
		canvas,
		context,
		resolution: {
			width: resolution.width,
			height: resolution.height,
			scale: resolution.scale ?? 1,
		},
		clampCameraDistance: { enabled: false },
		extras: scenario.extras ?? {},
	});

	try {
		viewer.load(source, scenario.useBookmark ?? false);

		// The example files ship with their own camera modes, animation
		// flags and watermarks. Pin all of them so the base render depends
		// only on the scenario, then layer the scenario's settings on top.
		viewer.cameraMode = "fixed";
		viewer.leftTag = null;
		viewer.rightTag = null;
		viewer.animation.pause();
		viewer.animation.time = scenario.animationTime ?? 0;

		const s = scenario.settings;
		if (s) {
			if (s.shadingMode !== undefined) viewer.shadingMode = s.shadingMode;
			if (s.renderMode !== undefined) viewer.renderMode = s.renderMode;
			if (s.projectionMode !== undefined) {
				viewer.projectionMode = s.projectionMode;
			}
			if (s.backgroundColor !== undefined) {
				viewer.backgroundColor = s.backgroundColor;
			}
			if (s.outlineSize !== undefined) viewer.outlineSize = s.outlineSize;
			if (s.outlineColor !== undefined) viewer.outlineColor = s.outlineColor;
			if (s.scanlines !== undefined) viewer.scanlines = s.scanlines;
			if (s.scanlineColor !== undefined) {
				viewer.scanlineColor = s.scanlineColor;
			}
			if (s.leftTag !== undefined) viewer.leftTag = s.leftTag;
			if (s.rightTag !== undefined) viewer.rightTag = s.rightTag;
			if (s.cameraMode !== undefined) viewer.cameraMode = s.cameraMode;
			if (s.cameraModeSpeed !== undefined) {
				viewer.cameraModeSpeed = s.cameraModeSpeed;
			}
			if (s.cameraModeDirection !== undefined) {
				viewer.cameraModeDirection = s.cameraModeDirection;
			}
			if (s.clampCameraDistance) {
				viewer.clampCameraDistance = {
					enabled: s.clampCameraDistance.enabled ?? false,
					minimumDistance: s.clampCameraDistance.minimumDistance ?? 0,
				};
			}
			if (s.camera) {
				const c = viewer.camera;
				// initFromState is the public way to flag the cached view
				// matrix as stale after writing the orbit parameters.
				c.initFromState({
					omega: s.camera.omega ?? c.omega,
					theta: s.camera.theta ?? c.theta,
					distanceToTarget: s.camera.distanceToTarget ?? c.distanceToTarget,
					target: new Float32Array(s.camera.target ?? c.target),
				});
				if (s.camera.zoom !== undefined) c.zoom = s.camera.zoom;
			}
		}

		const sync = scenario.syncCameraWithAnimation ?? true;
		const warmup = scenario.warmupFrames ?? 0;
		const step = scenario.frameStep ?? 1 / 60;
		for (let i = 0; i < warmup; i++) {
			viewer.draw(sync);
			viewer.advanceTime(step);
		}

		if (scenario.time) viewer.advanceTime(scenario.time);
		viewer.draw(sync);

		const gl = viewer.gl;
		const error = gl.getError();
		if (error !== gl.NO_ERROR) {
			throw new Error(`WebGL error after draw: ${glErrorName(gl, error)}`);
		}

		const pixels = viewer.toPixelData();
		return {
			width: canvas.width,
			height: canvas.height,
			pixels: bytesToBase64(pixels),
			ms: performance.now() - start,
		};
	} finally {
		viewer.dispose();
	}
}

function rendererString(): string {
	const gl = context.gl;
	const info = gl.getExtension("WEBGL_debug_renderer_info");
	const renderer = info
		? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
		: String(gl.getParameter(gl.RENDERER));
	return `${renderer} | ${gl.getParameter(gl.VERSION)}`;
}

window.__visual = {
	list: () => SCENARIOS.map((s) => ({ name: s.name, model: s.model })),
	renderer: rendererString,
	async render(name) {
		const scenario = scenarioByName.get(name);
		if (!scenario) return { error: `Unknown scenario "${name}"` };
		try {
			return await capture(scenario);
		} catch (err) {
			return {
				error: err instanceof Error ? (err.stack ?? err.message) : String(err),
			};
		}
	},
};
