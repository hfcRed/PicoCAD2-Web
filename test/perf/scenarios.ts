/**
 * Scenario catalogue for the performance pipeline.
 *
 * Every scenario describes one workload in the vocabulary of the current
 * library. The harness translates the settings for older builds and skips
 * a scenario on a build that lacks something it uses, so the same catalogue
 * measures every build. `legacyExtras` gives an older build the equivalent
 * effect where the name changed (the CRT screen became the video effects).
 *
 * Modes:
 * - `frames` (default) measures steady-state frames of a loaded viewer.
 * - `compile` measures the synchronous cost of a first load on a fresh
 *   context: context creation, load, and the first draw with its lazy
 *   shader compiles. This is the "hang on first load" number.
 * - `loop` runs the library's own render loop and measures the main-thread
 *   time per frame and the frame rate it reaches.
 *
 * Coverage goals:
 * - the plain render of every example model, at the app's scale and at a
 *   fill-heavy resolution,
 * - the per-frame CPU paths (animation, camera modes, the camera clamp),
 * - every post effect that exists in 1.3.0, so the versions compare,
 * - every effect that is new in 2.0.0, one scenario each,
 * - stacks, since the app's presets enable several effects at once,
 * - several viewers on one context, the shared render loop's reason to exist.
 */

import type {
	Color3,
	ExtrasOptions,
	ProjectionMode,
	TransparencyMode,
} from "../../lib/main.ts";

export type ModelName =
	| "advanced_meshes"
	| "helicopter_takeoff"
	| "livingroom"
	| "pig"
	| "pirate"
	| "rig"
	| "waterfall";

export type PerfMode = "frames" | "compile" | "loop";

export interface PerfSettings {
	shading?: boolean;
	renderMode?: "texture" | "color" | "none";
	projectionMode?: ProjectionMode;
	backgroundColor?: Color3 | null;
	outlineSize?: number;
	outlineColor?: Color3;
	scanlines?: boolean;
	cameraMode?: "fixed" | "spin" | "sway" | "pingpong";
	transparency?: TransparencyMode;
	clampCameraDistance?: boolean;
	animate?: boolean;
	animationTime?: number;
}

/** Effect settings in an older build's vocabulary, keyed by effect name. */
export type LegacyExtras = Record<string, Record<string, unknown>>;

export interface PerfScenario {
	name: string;
	model: ModelName;
	mode?: PerfMode;
	resolution?: { width: number; height: number; scale?: number };
	/** How many viewers share the context, each loading the next model. */
	viewers?: number;
	settings?: PerfSettings;
	extras?: ExtrasOptions;
	legacyExtras?: LegacyExtras;
}

const MODELS: ModelName[] = [
	"advanced_meshes",
	"helicopter_takeoff",
	"livingroom",
	"pig",
	"pirate",
	"rig",
	"waterfall",
];

const HD = { width: 512, height: 512 };

const LEGACY_POST_STACK: ExtrasOptions = {
	bloom: { enabled: true },
	colorGrading: { enabled: true, brightness: 1.1, saturation: 1.2 },
	depthFog: { enabled: true, near: 4, far: 30 },
	chromaticAberration: { enabled: true },
	noise: { enabled: true },
	vignette: { enabled: true },
};

const MATERIAL_STACK: ExtrasOptions = {
	rimLight: { enabled: true },
	gradientLight: { enabled: true },
	specular: { enabled: true, environment: { strength: 0.5 } },
	glitter: { enabled: true },
	emission: { enabled: true, maskedColors: [7], scrollSpeed: 1 },
	projection: { enabled: true, pattern: "voronoi" },
	interior: { enabled: true, maskedColors: [12], layers: 3 },
};

const POST_STACK: ExtrasOptions = {
	ssao: { enabled: true },
	depthFog: { enabled: true, near: 4, far: 30 },
	bloom: { enabled: true },
	colorGrading: { enabled: true, brightness: 1.1 },
	dithering: { enabled: true },
	videoEffects: { enabled: true, screenType: "crt", resolution: 96 },
	pixelation: { enabled: true, pixelSize: 2 },
	chromaticAberration: { enabled: true },
	noise: { enabled: true },
	vignette: { enabled: true },
};

const EVERYTHING: ExtrasOptions = {
	wireframe: { enabled: true },
	particles: { enabled: true },
	proceduralBackground: { enabled: true, pattern: "stars" },
	colorCutout: { enabled: true, maskedColors: [15] },
	dissolve: { enabled: true, cycle: { enabled: true } },
	paletteSwap: { enabled: true, cycleIndices: [7, 12] },
	interior: { enabled: true, maskedColors: [12] },
	rimLight: { enabled: true },
	gradientLight: { enabled: true },
	specular: { enabled: true, environment: { strength: 0.5 } },
	glitter: { enabled: true },
	emission: { enabled: true, maskedColors: [7] },
	projection: { enabled: true },
	display: { enabled: true, maskedColors: [12], resolution: 32 },
	fur: { enabled: true, maskedColors: [7] },
	meshDeform: { enabled: true, twist: { amount: 0.3 } },
	triangleFlash: { enabled: true },
	triangleShatter: { enabled: true, cycle: { enabled: true } },
	vertexGlitch: { enabled: true },
	billboard: { enabled: true, nodes: ["lamps"] },
	floor: { enabled: true, reflection: { enabled: true } },
	gradientOutline: { enabled: true },
	ssao: { enabled: true },
	colorGrading: { enabled: true },
	posterization: { enabled: true },
	bloom: { enabled: true },
	dithering: { enabled: true },
	videoEffects: { enabled: true, screenType: "crt", resolution: 96 },
	pixelation: { enabled: true, pixelSize: 2 },
	lensDistortion: { enabled: true, strength: 0.3 },
	noise: { enabled: true },
	chromaticAberration: { enabled: true },
	vignette: { enabled: true },
	depthFog: { enabled: true, near: 4, far: 30 },
	halftone: { enabled: true },
	glitch: { enabled: true },
	colorTint: { enabled: true },
	sharpen: { enabled: true },
	edgeDetection: { enabled: true, blend: 0.5 },
};

const base: PerfScenario[] = [
	...MODELS.map<PerfScenario>((model) => ({
		name: `base/model-${model}`,
		model,
	})),
	{
		name: "base/rig-scale4",
		model: "rig",
		resolution: { width: 128, height: 128, scale: 4 },
	},
	{ name: "base/rig-512", model: "rig", resolution: HD },
	{ name: "base/livingroom-512", model: "livingroom", resolution: HD },
	{
		name: "base/pig-animated",
		model: "pig",
		settings: { animate: true },
	},
	{
		name: "base/helicopter-animated",
		model: "helicopter_takeoff",
		settings: { animate: true },
	},
	{
		name: "base/rig-spin",
		model: "rig",
		settings: { cameraMode: "spin" },
	},
	{
		name: "base/livingroom-spin-clamp",
		model: "livingroom",
		settings: { cameraMode: "spin", clampCameraDistance: true },
	},
	{
		name: "base/rig-outline",
		model: "rig",
		settings: { outlineSize: 1, outlineColor: [1, 1, 1] },
	},
	{
		name: "base/pig-transparent",
		model: "pig",
		settings: { backgroundColor: [0, 0, 0] },
	},
	{
		name: "base/six-viewers",
		model: "rig",
		viewers: 6,
		resolution: { width: 128, height: 128, scale: 2 },
	},
	{
		name: "base/six-viewers-512",
		model: "rig",
		viewers: 6,
		resolution: HD,
	},
];

const post: PerfScenario[] = [
	{ name: "post/bloom", model: "rig", extras: { bloom: { enabled: true } } },
	{
		name: "post/dithering",
		model: "rig",
		extras: { dithering: { enabled: true } },
	},
	{
		name: "post/posterization",
		model: "rig",
		extras: { posterization: { enabled: true } },
	},
	{
		name: "post/color-grading",
		model: "rig",
		extras: { colorGrading: { enabled: true, brightness: 1.1 } },
	},
	{
		name: "post/color-tint",
		model: "rig",
		extras: { colorTint: { enabled: true, mode: "duotone" } },
	},
	{
		name: "post/halftone",
		model: "rig",
		extras: { halftone: { enabled: true } },
	},
	{ name: "post/noise", model: "rig", extras: { noise: { enabled: true } } },
	{ name: "post/glitch", model: "rig", extras: { glitch: { enabled: true } } },
	{
		name: "post/depth-fog",
		model: "rig",
		extras: { depthFog: { enabled: true, near: 4, far: 30 } },
	},
	{
		name: "post/edge-detection",
		model: "rig",
		extras: { edgeDetection: { enabled: true } },
	},
	{
		name: "post/sharpen",
		model: "rig",
		extras: { sharpen: { enabled: true } },
	},
	{
		name: "post/vignette",
		model: "rig",
		extras: { vignette: { enabled: true } },
	},
	{
		name: "post/chromatic-aberration",
		model: "rig",
		extras: { chromaticAberration: { enabled: true } },
	},
	{
		name: "post/lens-distortion",
		model: "rig",
		extras: { lensDistortion: { enabled: true, strength: 0.4 } },
	},
	{
		name: "post/pixelation",
		model: "rig",
		extras: { pixelation: { enabled: true, pixelSize: 3 } },
	},
	{
		name: "post/gradient-outline",
		model: "rig",
		extras: { gradientOutline: { enabled: true } },
	},
	{
		name: "post/wireframe",
		model: "rig",
		extras: { wireframe: { enabled: true } },
	},
	{
		name: "post/video-crt",
		model: "rig",
		extras: {
			videoEffects: { enabled: true, screenType: "crt", resolution: 96 },
		},
		legacyExtras: {
			crt: { enabled: true, curvature: 0.5, scanlineIntensity: 0.3 },
		},
	},
	{
		name: "post/legacy-stack",
		model: "rig",
		extras: LEGACY_POST_STACK,
	},
	{
		name: "post/legacy-stack-512",
		model: "rig",
		resolution: HD,
		extras: LEGACY_POST_STACK,
	},
	{ name: "post/ssao", model: "rig", extras: { ssao: { enabled: true } } },
	{
		name: "post/ssao-32-512",
		model: "livingroom",
		resolution: HD,
		extras: { ssao: { enabled: true, samples: 32 } },
	},
	{
		name: "post/procedural-background",
		model: "rig",
		extras: { proceduralBackground: { enabled: true, pattern: "stars" } },
	},
	{
		name: "post/particles",
		model: "rig",
		extras: { particles: { enabled: true } },
	},
	{
		name: "post/particles-cube-10k",
		model: "rig",
		extras: { particles: { enabled: true, shape: "cube", count: 10000 } },
	},
	{ name: "post/floor", model: "rig", extras: { floor: { enabled: true } } },
	{
		name: "post/floor-reflection",
		model: "rig",
		extras: { floor: { enabled: true, reflection: { enabled: true } } },
	},
];

const material: PerfScenario[] = [
	{
		name: "material/rim-light",
		model: "rig",
		extras: { rimLight: { enabled: true } },
	},
	{
		name: "material/gradient-light",
		model: "rig",
		extras: { gradientLight: { enabled: true } },
	},
	{
		name: "material/specular-environment",
		model: "rig",
		extras: { specular: { enabled: true, environment: { strength: 0.5 } } },
	},
	{
		name: "material/glitter",
		model: "rig",
		extras: { glitter: { enabled: true } },
	},
	{
		name: "material/emission-scroll",
		model: "rig",
		extras: { emission: { enabled: true, maskedColors: [7], scrollSpeed: 1 } },
	},
	{
		name: "material/projection-voronoi",
		model: "rig",
		extras: { projection: { enabled: true, pattern: "voronoi" } },
	},
	{
		name: "material/display-crt",
		model: "rig",
		extras: { display: { enabled: true, resolution: 32 } },
	},
	{
		name: "material/interior-stars",
		model: "rig",
		extras: { interior: { enabled: true, maskedColors: [12], layers: 3 } },
	},
	{
		name: "material/dissolve-cycle",
		model: "rig",
		extras: {
			dissolve: {
				enabled: true,
				cycle: { enabled: true },
				sweep: { mode: "directional" },
			},
		},
	},
	{
		name: "material/color-cutout",
		model: "rig",
		extras: { colorCutout: { enabled: true, maskedColors: [15] } },
	},
	{
		name: "material/palette-cycle",
		model: "rig",
		extras: { paletteSwap: { enabled: true, cycleIndices: [7, 12, 3] } },
	},
	{
		name: "material/stack",
		model: "rig",
		extras: MATERIAL_STACK,
	},
	{
		name: "material/stack-512",
		model: "rig",
		resolution: HD,
		extras: MATERIAL_STACK,
	},
];

const geometry: PerfScenario[] = [
	{
		name: "geometry/voxel",
		model: "rig",
		extras: { meshDeform: { enabled: true, voxel: { enabled: true } } },
	},
	{
		name: "geometry/twist",
		model: "rig",
		extras: { meshDeform: { enabled: true, twist: { amount: 0.5 } } },
	},
	{
		name: "geometry/triangle-flash",
		model: "rig",
		extras: { triangleFlash: { enabled: true } },
	},
	{
		name: "geometry/triangle-shatter-cycle",
		model: "rig",
		extras: { triangleShatter: { enabled: true, cycle: { enabled: true } } },
	},
	{
		name: "geometry/vertex-glitch",
		model: "rig",
		extras: { vertexGlitch: { enabled: true } },
	},
	{
		name: "geometry/billboard",
		model: "helicopter_takeoff",
		settings: { animate: true },
		extras: { billboard: { enabled: true } },
	},
	{ name: "geometry/fur", model: "rig", extras: { fur: { enabled: true } } },
	{
		name: "geometry/fur-16-layers",
		model: "rig",
		extras: { fur: { enabled: true, layers: 16 } },
	},
];

const combo: PerfScenario[] = [
	{
		name: "combo/transparency-smooth-dissolve-fur",
		model: "rig",
		settings: { transparency: "smooth" },
		extras: {
			dissolve: { enabled: true, progress: 0.4, style: "smooth" },
			fur: { enabled: true },
		},
	},
	{ name: "combo/post-stack", model: "rig", extras: POST_STACK },
	{
		name: "combo/post-stack-512",
		model: "rig",
		resolution: HD,
		extras: POST_STACK,
	},
	{ name: "combo/everything", model: "rig", extras: EVERYTHING },
	{
		name: "combo/everything-512",
		model: "rig",
		resolution: HD,
		extras: EVERYTHING,
	},
	{
		name: "combo/everything-animated-pig",
		model: "pig",
		settings: { animate: true },
		extras: EVERYTHING,
	},
];

const compile: PerfScenario[] = [
	{ name: "compile/plain", model: "rig", mode: "compile" },
	{
		name: "compile/fbo-path",
		model: "rig",
		mode: "compile",
		extras: { vignette: { enabled: true } },
	},
	{
		name: "compile/fur",
		model: "rig",
		mode: "compile",
		extras: { fur: { enabled: true } },
	},
	{
		name: "compile/floor-reflection",
		model: "rig",
		mode: "compile",
		extras: { floor: { enabled: true, reflection: { enabled: true } } },
	},
	{
		name: "compile/material-stack",
		model: "rig",
		mode: "compile",
		extras: MATERIAL_STACK,
	},
	{
		name: "compile/legacy-stack",
		model: "rig",
		mode: "compile",
		extras: LEGACY_POST_STACK,
	},
	{
		name: "compile/post-stack",
		model: "rig",
		mode: "compile",
		extras: POST_STACK,
	},
	{
		name: "compile/everything",
		model: "rig",
		mode: "compile",
		extras: EVERYTHING,
	},
];

const loop: PerfScenario[] = [
	{ name: "loop/rig", model: "rig", mode: "loop" },
	{
		name: "loop/six-viewers",
		model: "rig",
		mode: "loop",
		viewers: 6,
		resolution: { width: 128, height: 128, scale: 2 },
	},
	{
		name: "loop/six-viewers-512",
		model: "rig",
		mode: "loop",
		viewers: 6,
		resolution: HD,
	},
	{
		name: "loop/everything",
		model: "rig",
		mode: "loop",
		extras: EVERYTHING,
	},
];

export const SCENARIOS: PerfScenario[] = [
	...base,
	...post,
	...material,
	...geometry,
	...combo,
	...compile,
	...loop,
];
