/**
 * Scenario catalogue for the visual regression pipeline.
 *
 * Every scenario renders exactly one deterministic frame. Baselines live in
 * `test/visual/baselines/<name>.png`. The scenario name doubles as the file
 * path, so keep names stable (renaming a scenario orphans its baseline).
 *
 * Coverage goals:
 * - every viewer setting that changes pixels,
 * - every effect, every enum mode, every material style,
 * - both alpha paths (the pig renders on the transparent-background path,
 *   the rig on the opaque path),
 * - time-dependent effects at a pinned clock,
 * - a few stacked combinations for effect ordering.
 */

import type {
	CameraDistanceClamp,
	CameraMode,
	CameraSettings,
	Color3,
	ExtrasOptions,
	ProjectionMode,
	RenderMode,
	ViewerTag,
} from "../../lib/main.ts";

export type ModelName =
	| "advanced_meshes"
	| "helicopter_takeoff"
	| "livingroom"
	| "pig"
	| "pirate"
	| "rig"
	| "waterfall";

export interface ScenarioSettings {
	shading?: boolean;
	renderMode?: RenderMode;
	projectionMode?: ProjectionMode;
	backgroundColor?: Color3 | null;
	outlineSize?: number;
	outlineColor?: Color3;
	scanlines?: boolean;
	scanlineColor?: Color3;
	leftTag?: ViewerTag | null;
	rightTag?: ViewerTag | null;
	cameraMode?: CameraMode;
	cameraModeSpeed?: number;
	cameraModeDirection?: "left" | "right";
	camera?: Partial<CameraSettings>;
	clampCameraDistance?: Partial<CameraDistanceClamp>;
}

export interface Scenario {
	name: string;
	model: ModelName;
	resolution?: { width: number; height: number; scale?: number };
	useBookmark?: boolean;
	settings?: ScenarioSettings;
	extras?: ExtrasOptions;
	time?: number;
	animationTime?: number;
	warmupFrames?: number;
	frameStep?: number;
	syncCameraWithAnimation?: boolean;
}

const ALL_MODELS: ModelName[] = [
	"advanced_meshes",
	"helicopter_takeoff",
	"livingroom",
	"pig",
	"pirate",
	"rig",
	"waterfall",
];

const TRANSPARENT_BLACK: Color3 = [0, 0, 0];

const core: Scenario[] = [
	...ALL_MODELS.map<Scenario>((model) => ({
		name: `core/model-${model}`,
		model,
	})),
	{ name: "core/bookmark-pig", model: "pig", useBookmark: true },
	{
		name: "core/render-mode-color",
		model: "pig",
		settings: { renderMode: "color" },
	},
	{
		name: "core/render-mode-none",
		model: "pig",
		settings: { renderMode: "none" },
	},
	{ name: "core/shading-off", model: "rig", settings: { shading: false } },
	{
		name: "core/projection-orthographic",
		model: "rig",
		settings: { projectionMode: "orthographic" },
	},
	{
		name: "core/projection-fisheye",
		model: "livingroom",
		settings: { projectionMode: "fisheye" },
	},
	{
		name: "core/background-transparent",
		model: "pig",
		settings: { backgroundColor: TRANSPARENT_BLACK },
	},
	{
		name: "core/background-override",
		model: "rig",
		settings: { backgroundColor: [0.2, 0.1, 0.3] },
	},
	{
		name: "core/outline",
		model: "pig",
		settings: { outlineSize: 2, outlineColor: [1, 0, 0.5] },
	},
	{
		name: "core/outline-transparent",
		model: "pig",
		settings: {
			backgroundColor: TRANSPARENT_BLACK,
			outlineSize: 1,
			outlineColor: [1, 1, 1],
		},
	},
	{
		name: "core/scanlines-and-tags-scale2",
		model: "pirate",
		resolution: { width: 128, height: 128, scale: 2 },
		settings: {
			scanlines: true,
			scanlineColor: [0, 0, 0.2],
			leftTag: { text: "left", color: [1, 0.5, 0] },
			rightTag: { text: "RIGHT 123" },
		},
	},
	{
		name: "core/non-square-160x90",
		model: "waterfall",
		resolution: { width: 160, height: 90 },
	},
	{
		name: "core/non-square-64x128-scale3",
		model: "advanced_meshes",
		resolution: { width: 64, height: 128, scale: 3 },
	},
	{
		name: "core/animation-pose",
		model: "helicopter_takeoff",
		animationTime: 1.5,
	},
	{
		name: "core/animation-pose-pig",
		model: "pig",
		animationTime: 0.5,
	},
	{
		name: "core/camera-moved",
		model: "pig",
		settings: {
			camera: {
				omega: 2.2,
				theta: -0.3,
				distanceToTarget: 9,
				zoom: 1.4,
				target: [0.5, 1, -0.5],
			},
		},
	},
	{
		name: "core/camera-mode-spin",
		model: "helicopter_takeoff",
		settings: { cameraMode: "spin" },
		animationTime: 2,
	},
	{
		name: "core/camera-mode-sway-unsynced",
		model: "pig",
		settings: { cameraMode: "sway", cameraModeSpeed: 1.5 },
		syncCameraWithAnimation: false,
		time: 0.8,
	},
	{
		name: "core/camera-mode-pingpong-left",
		model: "rig",
		settings: {
			cameraMode: "pingpong",
			cameraModeDirection: "left",
			cameraModeSpeed: 2,
		},
		syncCameraWithAnimation: false,
		time: 1.3,
	},
	{
		name: "core/clamp-camera-distance",
		model: "livingroom",
		settings: {
			clampCameraDistance: { enabled: true, minimumDistance: 2 },
			camera: { distanceToTarget: 1 },
		},
	},
];

const material: Scenario[] = [
	// Rim light
	{
		name: "material/rim-light-palette",
		model: "pig",
		extras: { rimLight: { enabled: true } },
	},
	{
		name: "material/rim-light-dithered",
		model: "pig",
		extras: {
			rimLight: { enabled: true, style: "dithered", color: [1, 0.3, 0.8] },
		},
	},
	{
		name: "material/rim-light-smooth",
		model: "pig",
		extras: {
			rimLight: { enabled: true, style: "smooth", width: 0.6, sharpness: 0.2 },
		},
	},
	{
		name: "material/rim-light-masked-invert-aligned",
		model: "rig",
		extras: {
			rimLight: {
				enabled: true,
				invert: true,
				lightAlign: 1,
				blend: 0.7,
				maskedColors: [7],
			},
		},
	},
	// Gradient light
	{
		name: "material/gradient-light-light-palette",
		model: "pig",
		extras: { gradientLight: { enabled: true } },
	},
	{
		name: "material/gradient-light-worldy-dithered",
		model: "rig",
		extras: {
			gradientLight: { enabled: true, source: "worldY", style: "dithered" },
		},
	},
	{
		name: "material/gradient-light-screeny-smooth",
		model: "pirate",
		extras: {
			gradientLight: {
				enabled: true,
				source: "screenY",
				style: "smooth",
				blend: 1,
				litColor: [1, 0, 0],
				shadowColor: [0, 0, 1],
			},
		},
	},
	// Specular
	{
		name: "material/specular-palette",
		model: "pig",
		extras: { specular: { enabled: true, strength: 1, smoothness: 0.3 } },
	},
	{
		name: "material/specular-anisotropic-smooth",
		model: "rig",
		extras: {
			specular: {
				enabled: true,
				style: "smooth",
				strength: 1,
				smoothness: 0.8,
				anisotropy: 0.8,
				color: [1, 0.8, 0.2],
			},
		},
	},
	{
		name: "material/specular-environment-dithered",
		model: "pig",
		extras: {
			specular: {
				enabled: true,
				style: "dithered",
				environment: { strength: 1, horizon: 0.3, fresnel: 0.8 },
			},
		},
	},
	// Glitter
	{
		name: "material/glitter-uv-palette",
		model: "pig",
		extras: { glitter: { enabled: true, speed: 0 } },
	},
	{
		name: "material/glitter-screen-circle-dithered",
		model: "rig",
		extras: {
			glitter: {
				enabled: true,
				space: "screen",
				shape: "circle",
				style: "dithered",
				density: 24,
				size: 0.9,
				speed: 0,
			},
		},
	},
	{
		name: "material/glitter-world-hue-smooth-time",
		model: "pirate",
		extras: {
			glitter: {
				enabled: true,
				space: "world",
				style: "smooth",
				randomHue: true,
				hueRange: 1,
				angleRange: 90,
				brightness: 0.7,
			},
		},
		time: 1.25,
	},
	// Emission
	{
		name: "material/emission-masked-palette",
		model: "pig",
		extras: { emission: { enabled: true, maskedColors: [9] } },
	},
	{
		name: "material/emission-half-smooth",
		model: "rig",
		extras: {
			emission: {
				enabled: true,
				style: "smooth",
				strength: 0.5,
				maskedColors: [7, 12],
			},
		},
	},
	{
		name: "material/emission-blink-pulse-time",
		model: "pig",
		extras: {
			emission: {
				enabled: true,
				maskedColors: [9],
				blinkMode: "pulse",
				blinkRate: 2,
				blinkMin: 0.5,
			},
		},
		time: 0.3,
	},
	{
		name: "material/emission-scroll-time",
		model: "rig",
		extras: {
			emission: {
				enabled: true,
				style: "dithered",
				maskedColors: [7],
				scrollDirection: [1, 0.5, 0],
				scrollWidth: 0.2,
				scrollGap: 0.3,
				scrollSpeed: 0.7,
			},
		},
		time: 0.9,
	},
	// Projection
	{
		name: "material/projection-light-voronoi",
		model: "rig",
		extras: { projection: { enabled: true, mode: "light" } },
	},
	{
		name: "material/projection-shadow-voronoi",
		model: "rig",
		extras: { projection: { enabled: true } },
	},
	{
		name: "material/projection-tint-grid-smooth-time",
		model: "pirate",
		extras: {
			projection: {
				enabled: true,
				mode: "tint",
				pattern: "grid",
				style: "smooth",
				color: [0, 1, 1],
				direction: [1, 0, 0],
				facing: 0,
				scale: 3,
				speed: 1,
			},
		},
		time: 0.5,
	},
	{
		name: "material/projection-truchet-masked-dithered",
		model: "rig",
		extras: {
			projection: {
				enabled: true,
				mode: "tint",
				pattern: "truchet",
				style: "dithered",
				color: [1, 0.2, 0.9],
				scale: 4,
				strength: 0.6,
				maskedColors: [7],
			},
		},
	},
	// Seed 0 slices the star field at depth 0 exactly, which a flat slice
	// would miss entirely, so this frame proves the oblique slice.
	{
		name: "material/projection-stars-tint-seed0",
		model: "rig",
		extras: {
			projection: {
				enabled: true,
				mode: "tint",
				pattern: "stars",
				color: [1, 1, 0],
				scale: 3,
				speed: 0,
				facing: 0,
			},
		},
	},
	{
		name: "material/projection-dust-tint-time",
		model: "pig",
		extras: {
			projection: {
				enabled: true,
				mode: "tint",
				pattern: "dust",
				color: [1, 1, 1],
				scale: 4,
				facing: 0,
			},
		},
		time: 1.3,
	},
	{
		name: "material/projection-constellations-shadow-transparent",
		model: "pig",
		settings: { backgroundColor: TRANSPARENT_BLACK },
		extras: {
			projection: {
				enabled: true,
				mode: "shadow",
				pattern: "constellations",
				scale: 3,
				facing: 0,
				seed: 3,
			},
		},
	},
	// Dissolve
	{
		name: "material/dissolve-noise",
		model: "pig",
		extras: { dissolve: { enabled: true, progress: 0.5 } },
	},
	{
		name: "material/dissolve-noise-transparent",
		model: "pig",
		settings: { backgroundColor: TRANSPARENT_BLACK, outlineSize: 1 },
		extras: {
			dissolve: { enabled: true, progress: 0.6, sweep: { scale: 4 } },
		},
	},
	{
		name: "material/dissolve-directional-invert-dithered",
		model: "rig",
		extras: {
			dissolve: {
				enabled: true,
				progress: 0.3, // not 0.5, where a coordinate flip and a progress inversion coincide
				sweep: { mode: "directional", direction: [1, 0.2, 0], invert: true },
				style: "dithered",
			},
		},
	},
	{
		name: "material/dissolve-point-smooth",
		model: "pig",
		extras: {
			dissolve: {
				enabled: true,
				progress: 0.55,
				sweep: { mode: "point", point: [0.5, 0.5, 0] },
				style: "smooth",
				edgeWidth: 0.2,
				edgeColor: [0, 1, 1],
			},
		},
	},
	{
		name: "material/dissolve-proximity-hard",
		model: "livingroom",
		extras: {
			dissolve: {
				enabled: true,
				progress: 0.4,
				sweep: { mode: "proximity", softness: 0 },
				edgeWidth: 0,
			},
		},
	},
	{
		name: "material/dissolve-masked-with-fur",
		model: "pig",
		extras: {
			dissolve: { enabled: true, progress: 0.5, maskedColors: [9] },
			fur: { enabled: true },
		},
	},
	// A uniform sweep has no front. The whole surface fades through the
	// checkerboard, so progress 0.5 keeps exactly one checker phase.
	// A wave is a band that crosses the model, so the dissolved region has
	// an ember edge on both sides and the model is whole behind it.
	{
		name: "material/dissolve-wave-directional",
		model: "rig",
		extras: {
			dissolve: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "directional", direction: [1, 0, 0], wave: 0.3 },
			},
		},
	},
	// An inverted dissolve at progress 0 has dissolved everything it masks.
	{
		name: "material/dissolve-invert-rest-masked",
		model: "rig",
		extras: {
			dissolve: {
				enabled: true,
				progress: 0,
				sweep: { mode: "directional", invert: true },
				maskedColors: [7],
			},
		},
	},
	{
		name: "material/dissolve-uniform",
		model: "rig",
		extras: {
			dissolve: { enabled: true, progress: 0.5, sweep: { mode: "uniform" } },
		},
	},
	// Dissolve cycle: custom duration 2 with hold 0.25 rises over 0.25-1.0,
	// rests at 1 until 1.25 and falls over 1.25-2.0.
	{
		name: "material/dissolve-cycle-rising",
		model: "pig",
		time: 0.55, // progress 0.4
		extras: {
			dissolve: {
				enabled: true,
				progress: 0,
				cycle: { enabled: true, duration: 2, hold: 0.25 },
			},
		},
	},
	{
		name: "material/dissolve-cycle-falling",
		model: "pig",
		time: 3.85, // second loop, progress 0.2
		extras: {
			dissolve: {
				enabled: true,
				sweep: { mode: "directional" },
				cycle: { enabled: true, duration: 2, hold: 0.25 },
			},
		},
	},
	// Interior
	{
		name: "material/interior-stars-palette",
		model: "pig",
		extras: { interior: { enabled: true, maskedColors: [9] } },
	},
	{
		name: "material/interior-stars-seed",
		model: "pig",
		extras: { interior: { enabled: true, maskedColors: [9], seed: 3 } },
	},
	{
		name: "material/interior-voronoi-dithered",
		model: "rig",
		extras: {
			interior: {
				enabled: true,
				pattern: "voronoi",
				style: "dithered",
				maskedColors: [7],
			},
		},
	},
	{
		name: "material/interior-lava-smooth-hue-time",
		model: "pig",
		extras: {
			interior: {
				enabled: true,
				pattern: "lava",
				style: "smooth",
				randomHue: true,
				hueRange: 0.8,
				depth: 4,
				layers: 5,
				maskedColors: [9],
			},
		},
		time: 2,
	},
	{
		name: "material/interior-grid",
		model: "rig",
		extras: {
			interior: {
				enabled: true,
				pattern: "grid",
				scale: 8,
				maskedColors: [7, 12],
			},
		},
	},
	{
		name: "material/interior-truchet",
		model: "pig",
		extras: {
			interior: { enabled: true, pattern: "truchet", maskedColors: [9] },
		},
	},
	{
		name: "material/interior-constellations",
		model: "pig",
		extras: {
			interior: { enabled: true, pattern: "constellations", maskedColors: [9] },
		},
	},
	{
		name: "material/interior-dust",
		model: "rig",
		extras: { interior: { enabled: true, pattern: "dust", maskedColors: [7] } },
	},
	// Color cutout & palette swap
	{
		name: "material/color-cutout",
		model: "pig",
		settings: { outlineSize: 1 },
		extras: { colorCutout: { enabled: true, maskedColors: [9] } },
	},
	{
		name: "material/color-cutout-opaque",
		model: "rig",
		extras: { colorCutout: { enabled: true, maskedColors: [7, 12] } },
	},
	{
		name: "material/palette-swap-map",
		model: "pig",
		extras: { paletteSwap: { enabled: true, map: [9, 12, 12, 9] } },
	},
	{
		name: "material/palette-swap-cycle-dithered",
		model: "rig",
		extras: {
			paletteSwap: {
				enabled: true,
				cycleIndices: [7, 12, 6],
				cycleSpeed: 2,
				cycleBlendTime: 0.3,
			},
		},
		time: 0.45,
	},
	{
		name: "material/palette-swap-cycle-smooth",
		model: "rig",
		extras: {
			paletteSwap: {
				enabled: true,
				cycleIndices: [7, 12, 6],
				cycleSpeed: 2,
				cycleStyle: "smooth",
				cycleBlendTime: 0.5,
			},
		},
		time: 0.45,
	},
	{
		name: "material/palette-swap-cycle-palette",
		model: "pig",
		extras: {
			paletteSwap: {
				enabled: true,
				cycleIndices: [9, 12],
				cycleSpeed: 1,
				cycleStyle: "palette",
			},
		},
		time: 1.5,
	},
];

const geometry: Scenario[] = [
	// Mesh deform
	{
		name: "geometry/voxel",
		model: "pig",
		extras: { meshDeform: { enabled: true, voxel: { enabled: true } } },
	},
	{
		name: "geometry/voxel-coarse-barrel",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				voxel: { enabled: true, gridSize: 0.5 },
				barrel: { amount: 0.5, axis: "y" },
			},
		},
	},
	{
		name: "geometry/barrel-x",
		model: "pig",
		extras: {
			meshDeform: { enabled: true, barrel: { amount: -0.6, axis: "x" } },
		},
	},
	{
		name: "geometry/spherify",
		model: "rig",
		extras: { meshDeform: { enabled: true, spherify: { amount: 0.7 } } },
	},
	{
		name: "geometry/twist-time",
		model: "pig",
		extras: {
			meshDeform: {
				enabled: true,
				twist: { amount: 1.5, axis: "y", speed: 1 },
			},
		},
		time: 0.5,
	},
	{
		name: "geometry/twist-z-animated-model",
		model: "helicopter_takeoff",
		extras: { meshDeform: { enabled: true, twist: { amount: 1, axis: "z" } } },
		animationTime: 1,
	},
	// Mesh deform sweeps. The warps scale by the front's local progress at
	// each vertex, and voxelization draws a selected node from both its base
	// mesh and its stand-in, each cut at the front.
	{
		name: "geometry/deform-twist-sweep-directional",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "directional", direction: [0, 1, 0], softness: 0.3 },
				twist: { amount: 1, axis: "y" },
			},
		},
	},
	{
		name: "geometry/deform-barrel-sweep-point-cycle",
		model: "pig",
		time: 0.55, // progress 0.4 with duration 2 and hold 0.25
		extras: {
			meshDeform: {
				enabled: true,
				cycle: { enabled: true, duration: 2, hold: 0.25 },
				sweep: { mode: "point", point: [0, 0, 0], softness: 0.5 },
				barrel: { amount: 0.8, axis: "y" },
			},
		},
	},
	// An inverted voxel sweep at progress 0 is fully voxelized, so this must
	// equal geometry/voxel byte for byte.
	{
		name: "geometry/voxel-sweep-invert-rest",
		model: "pig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0,
				sweep: { mode: "directional", direction: [0, 1, 0], invert: true },
				voxel: { enabled: true },
			},
		},
	},
	{
		name: "geometry/deform-twist-sweep-wave",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "directional", direction: [0, 1, 0], wave: 0.4 },
				twist: { amount: 1, axis: "y" },
			},
		},
	},
	{
		name: "geometry/voxel-sweep-wave-point",
		model: "pig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "point", point: [0, 0, 0], wave: 0.5 },
				voxel: { enabled: true },
			},
		},
	},
	{
		name: "geometry/voxel-sweep-directional",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "directional", direction: [1, 0, 0] },
				voxel: { enabled: true, gridSize: 0.4 },
			},
		},
	},
	// A uniform sweep has no cells to move through, so the hard cut flips
	// the whole model at progress 0.5. Past it the dual draw must equal the
	// fully voxelized single draw byte for byte.
	{
		name: "geometry/voxel-sweep-uniform-flipped",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0.6,
				voxel: { enabled: true, gridSize: 0.4 },
			},
		},
	},
	{
		name: "geometry/voxel-sweep-uniform-complete",
		model: "rig",
		extras: {
			meshDeform: { enabled: true, voxel: { enabled: true, gridSize: 0.4 } },
		},
	},
	{
		name: "geometry/voxel-sweep-noise-fur-wireframe",
		model: "pig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "noise", scale: 2, softness: 0.3 },
				voxel: { enabled: true },
			},
			fur: { enabled: true },
			wireframe: { enabled: true, color: [0, 1, 0] },
		},
	},
	// The wireframe follows the deform chain.
	{
		name: "geometry/twist-wireframe",
		model: "pig",
		extras: {
			meshDeform: { enabled: true, twist: { amount: 1, axis: "y" } },
			wireframe: { enabled: true, color: [0, 1, 0] },
		},
	},
	// Vertex glitch: beats at rate 8 last 0.125 s and a spike 0.1 s, so
	// time 0.3 (beat 2, age 0.05) and 0.55 (beat 4, age 0.05) both spike.
	{
		name: "geometry/vertex-glitch-triangle",
		model: "rig",
		extras: { vertexGlitch: { enabled: true, unit: "triangle" } },
		time: 0.3,
	},
	// Softness eases a spike out and back: at time 0.27 (beat 2, age 0.02,
	// phase 0.2) a fully soft spike stands at 40% of its height.
	{
		name: "geometry/vertex-glitch-soft",
		model: "rig",
		extras: {
			vertexGlitch: {
				enabled: true,
				unit: "triangle",
				density: 0.6,
				softness: 1,
			},
		},
		time: 0.27,
	},
	{
		name: "geometry/vertex-glitch-vertex-wireframe-fur",
		model: "pig",
		extras: {
			vertexGlitch: { enabled: true, unit: "vertex", strength: 0.3 },
			wireframe: { enabled: true, color: [0, 1, 0] },
			fur: { enabled: true },
		},
		time: 0.3,
	},
	{
		name: "geometry/vertex-glitch-sweep-wave-cycle",
		model: "rig",
		time: 0.55, // progress 0.4 with duration 2 and hold 0.25
		extras: {
			vertexGlitch: {
				enabled: true,
				strength: 0.4,
				density: 0.6,
				cycle: { enabled: true, duration: 2, hold: 0.25 },
				sweep: { mode: "directional", direction: [1, 0, 0], wave: 0.3 },
			},
		},
	},
	{
		name: "geometry/vertex-glitch-masked-invert",
		model: "rig",
		extras: {
			vertexGlitch: {
				enabled: true,
				progress: 0.3,
				density: 0.8,
				maskedColors: [7],
				sweep: { mode: "point", point: [0, 0, 0], invert: true },
			},
		},
		time: 0.3,
	},
	// Triangle flash
	{
		name: "geometry/triangle-flash-replace",
		model: "pig",
		extras: { triangleFlash: { enabled: true, density: 0.4 } },
		time: 0.3,
	},
	{
		name: "geometry/triangle-flash-add-soft-smooth",
		model: "rig",
		extras: {
			triangleFlash: {
				enabled: true,
				mode: "add",
				style: "smooth",
				softness: 0.5,
				density: 0.5,
				color: [0.2, 1, 0.4],
			},
		},
		time: 0.3,
	},
	{
		name: "geometry/triangle-flash-dithered-masked",
		model: "rig",
		extras: {
			triangleFlash: {
				enabled: true,
				style: "dithered",
				density: 0.6,
				maskedColors: [7],
			},
		},
		time: 0.3,
	},
	// Triangle shatter sweeps: each triangle flies at the local progress of
	// the front at its centroid, so the debris moves across the model.
	{
		name: "geometry/triangle-shatter-sweep-directional",
		model: "rig",
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "directional", direction: [1, 0, 0] },
			},
		},
	},
	{
		name: "geometry/triangle-shatter-sweep-noise-soft",
		model: "pig",
		settings: { backgroundColor: TRANSPARENT_BLACK },
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 0.4,
				sweep: { mode: "noise", scale: 2, softness: 0.5 },
			},
		},
	},
	{
		name: "geometry/triangle-shatter-sweep-point-invert",
		model: "rig",
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 0.3,
				mode: "radial",
				sweep: { mode: "point", point: [0, 0, 0], invert: true },
			},
		},
	},
	{
		name: "geometry/triangle-shatter-sweep-wave-cycle",
		model: "rig",
		time: 0.55, // progress 0.4 with duration 2 and hold 0.25
		extras: {
			triangleShatter: {
				enabled: true,
				cycle: { enabled: true, duration: 2, hold: 0.25 },
				sweep: { mode: "directional", direction: [1, 0, 0], wave: 0.3 },
			},
		},
	},
	// Inverting a sweep inverts the progress, so an inverted directional
	// sweep at low progress is a mostly shattered model assembling from
	// the start side, and an inverted uniform sweep at 0.5 equals the
	// plain shatter at 0.5 (proved byte-identical to triangle-shatter-normal).
	{
		name: "geometry/triangle-shatter-sweep-directional-invert",
		model: "rig",
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 0.3,
				sweep: { mode: "directional", direction: [1, 0, 0], invert: true },
			},
		},
	},
	// The resting states of an inverted sweep: fully shattered at progress
	// 0, which must equal the plain front at progress 1 byte for byte.
	{
		name: "geometry/triangle-shatter-sweep-directional-full",
		model: "rig",
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 1,
				sweep: { mode: "directional", direction: [1, 0, 0] },
			},
		},
	},
	{
		name: "geometry/triangle-shatter-sweep-invert-rest",
		model: "rig",
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 0,
				sweep: { mode: "directional", direction: [1, 0, 0], invert: true },
			},
		},
	},
	{
		name: "geometry/triangle-shatter-sweep-uniform-invert",
		model: "pig",
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "uniform", invert: true },
			},
		},
	},
	{
		name: "geometry/triangle-shatter-sweep-proximity-cycle",
		model: "livingroom",
		time: 0.55, // progress 0.4 with duration 2 and hold 0.25
		extras: {
			triangleShatter: {
				enabled: true,
				cycle: { enabled: true, duration: 2, hold: 0.25 },
				sweep: { mode: "proximity", softness: 0.3 },
			},
		},
	},
	// Triangle shatter
	{
		name: "geometry/triangle-shatter-normal",
		model: "pig",
		extras: { triangleShatter: { enabled: true, progress: 0.5 } },
	},
	{
		name: "geometry/triangle-shatter-radial",
		model: "rig",
		extras: {
			triangleShatter: {
				enabled: true,
				mode: "radial",
				progress: 0.4,
				spread: 0.6,
			},
		},
	},
	{
		name: "geometry/triangle-shatter-directional-gravity-shrink",
		model: "pig",
		extras: {
			triangleShatter: {
				enabled: true,
				mode: "directional",
				direction: [1, 0.5, 0],
				progress: 0.6,
				gravity: 1,
				shrink: 0.5,
				rotation: 2,
				distance: 3,
			},
		},
	},
	{
		name: "geometry/triangle-shatter-masked",
		model: "rig",
		extras: {
			triangleShatter: { enabled: true, progress: 0.7, maskedColors: [7] },
		},
	},
	// Fur
	{
		name: "geometry/fur-default",
		model: "pig",
		extras: { fur: { enabled: true } },
	},
	{
		name: "geometry/fur-long-gravity",
		model: "pig",
		extras: {
			fur: {
				enabled: true,
				length: 0.3,
				layers: 12,
				density: 60,
				gravity: [0.2, -0.8, 0],
				rootShade: 0.5,
			},
		},
	},
	{
		name: "geometry/fur-masked-opaque",
		model: "rig",
		extras: { fur: { enabled: true, length: 0.2, maskedColors: [7] } },
	},
	{
		name: "geometry/fur-hidden-by-shatter",
		model: "pig",
		extras: {
			fur: { enabled: true },
			triangleShatter: { enabled: true, progress: 0.3 },
		},
	},
	// Shatter cycle: defaults (duration 4, hold 0.5) rise over 0.5-2.0 and fall
	// over 2.5-4.0. Manual progress is ignored while cycling.
	{
		name: "geometry/triangle-shatter-cycle-rising",
		model: "pig",
		time: 1.1, // progress 0.4
		extras: {
			triangleShatter: { enabled: true, progress: 1, cycle: { enabled: true } },
		},
	},
	{
		name: "geometry/triangle-shatter-cycle-falling",
		model: "pig",
		time: 3.7, // progress 0.2
		extras: {
			triangleShatter: { enabled: true, progress: 1, cycle: { enabled: true } },
		},
	},
	{
		// Second loop, inside the rest at 0: fur is back and the model intact.
		name: "geometry/fur-restored-by-shatter-cycle-hold",
		model: "pig",
		time: 4.3,
		extras: {
			fur: { enabled: true },
			triangleShatter: { enabled: true, progress: 1, cycle: { enabled: true } },
		},
	},
	// Billboard
	{
		name: "geometry/billboard-all-full",
		model: "pig",
		settings: { camera: { omega: 2.5, theta: 0.9 } },
		extras: { billboard: { enabled: true } },
	},
	{
		name: "geometry/billboard-named-yaw",
		model: "rig",
		settings: { camera: { omega: 1.8 } },
		extras: {
			billboard: { enabled: true, nodes: ["front bumper"], mode: "yaw" },
		},
	},
	{
		name: "geometry/billboard-animated-inheritance",
		model: "helicopter_takeoff",
		extras: { billboard: { enabled: true, nodes: ["body"] } },
		animationTime: 1.5,
	},
];

const post: Scenario[] = [
	{
		name: "post/wireframe",
		model: "rig",
		extras: { wireframe: { enabled: true, color: [0, 1, 0] } },
	},
	{
		name: "post/wireframe-render-none",
		model: "pig",
		settings: { renderMode: "none" },
		extras: { wireframe: { enabled: true } },
	},
	// Particles
	{
		name: "post/particles-pixel-drift",
		model: "pig",
		extras: { particles: { enabled: true } },
		time: 1,
	},
	{
		name: "post/particles-quad-orbit-palette",
		model: "rig",
		extras: {
			particles: {
				enabled: true,
				shape: "quad",
				motion: "orbit",
				paletteIndices: [7, 12],
				size: 4,
				count: 120,
			},
		},
		time: 1,
	},
	{
		name: "post/particles-cube-linear-velocity",
		model: "pig",
		extras: {
			particles: {
				enabled: true,
				shape: "cube",
				size: 0.3,
				count: 150,
				motion: "linear",
				velocity: [0, -1, 0],
				speed: 2,
				twinkle: 0,
				sizeJitter: 0,
			},
		},
		time: 1,
	},
	{
		name: "post/particles-triangle-hue",
		model: "pirate",
		extras: {
			particles: {
				enabled: true,
				shape: "triangle",
				randomHue: true,
				hueRange: 1,
				areaScale: 2.5,
				count: 500,
			},
		},
		time: 1,
	},
	// Procedural background
	{
		name: "post/procedural-background-stars",
		model: "pig",
		extras: { proceduralBackground: { enabled: true } },
	},
	{
		name: "post/procedural-background-voronoi-palette",
		model: "rig",
		extras: {
			proceduralBackground: {
				enabled: true,
				pattern: "voronoi",
				style: "palette",
			},
		},
	},
	{
		name: "post/procedural-background-truchet-dithered",
		model: "pig",
		extras: {
			proceduralBackground: {
				enabled: true,
				pattern: "truchet",
				style: "dithered",
			},
		},
	},
	{
		name: "post/procedural-background-constellations-time",
		model: "pig",
		extras: {
			proceduralBackground: {
				enabled: true,
				pattern: "constellations",
				seed: 3,
			},
		},
		time: 1.5,
	},
	{
		name: "post/procedural-background-lava-hue",
		model: "rig",
		extras: {
			proceduralBackground: {
				enabled: true,
				pattern: "lava",
				randomHue: true,
				hueRange: 0.6,
				scale: 6,
			},
		},
		time: 0.5,
	},
	{
		name: "post/procedural-background-dust",
		model: "pig",
		extras: { proceduralBackground: { enabled: true, pattern: "dust" } },
	},
	{
		name: "post/procedural-background-grid-parallax",
		model: "pig",
		settings: { camera: { omega: 2.4, theta: 0.1 } },
		extras: {
			proceduralBackground: {
				enabled: true,
				pattern: "grid",
				cameraParallax: 1,
				colorA: [0.1, 0, 0],
				colorB: [1, 0.5, 0],
			},
		},
	},
	{
		name: "post/procedural-background-with-fog",
		model: "livingroom",
		extras: {
			proceduralBackground: { enabled: true, pattern: "stars" },
			depthFog: { enabled: true, modelOnly: false, near: 2, far: 12 },
		},
	},
	// Gradient outline
	{
		name: "post/gradient-outline",
		model: "pig",
		extras: { gradientOutline: { enabled: true, size: 2 } },
	},
	{
		name: "post/gradient-outline-directional",
		model: "rig",
		extras: {
			gradientOutline: {
				enabled: true,
				size: 3,
				gradient: 0.5,
				gradientDirection: 45,
				colorFrom: [1, 0, 0],
				colorTo: [0, 0, 1],
			},
		},
	},
	{
		name: "post/gradient-outline-growth",
		model: "pig",
		extras: {
			gradientOutline: {
				enabled: true,
				size: 3,
				growthDirection: 90,
				growthFactor: 1,
			},
		},
	},
	{
		name: "post/gradient-outline-drop-shadow",
		model: "pig",
		settings: { backgroundColor: TRANSPARENT_BLACK },
		extras: {
			gradientOutline: {
				enabled: true,
				mode: "dropShadow",
				shadowOffset: [3, -3],
			},
		},
	},
	// SSAO
	{
		name: "post/ssao-palette",
		model: "livingroom",
		extras: { ssao: { enabled: true } },
	},
	{
		name: "post/ssao-dithered-8",
		model: "rig",
		extras: {
			ssao: { enabled: true, style: "dithered", samples: 8, radius: 2 },
		},
	},
	{
		name: "post/ssao-smooth-32-ortho",
		model: "livingroom",
		settings: { projectionMode: "orthographic" },
		extras: {
			ssao: {
				enabled: true,
				style: "smooth",
				samples: 32,
				intensity: 2,
				power: 2,
			},
		},
	},
	{
		name: "post/ssao-masked",
		model: "pig",
		extras: { ssao: { enabled: true, maskedColors: [9] } },
	},
	// Color effects
	{
		name: "post/color-grading",
		model: "pig",
		extras: {
			colorGrading: {
				enabled: true,
				brightness: 1.2,
				contrast: 1.3,
				saturation: 0.5,
				hue: 120,
			},
		},
	},
	{
		name: "post/color-grading-masked-fullscreen",
		model: "rig",
		extras: {
			colorGrading: {
				enabled: true,
				modelOnly: false,
				hue: 180,
				maskedColors: [7],
			},
		},
	},
	{
		name: "post/posterization",
		model: "pirate",
		extras: { posterization: { enabled: true, levels: 3, gamma: 1.5 } },
	},
	{
		name: "post/posterization-channel-banding",
		model: "pig",
		extras: {
			posterization: {
				enabled: true,
				channelLevels: [2, 4, 8],
				colorBanding: true,
			},
		},
	},
	{
		name: "post/bloom",
		model: "pig",
		extras: {
			bloom: { enabled: true, threshold: 0.5, intensity: 1.5, blur: 6 },
		},
	},
	{
		name: "post/bloom-masked-emission",
		model: "pig",
		extras: {
			bloom: { enabled: true, maskedColors: [9], threshold: 0 },
			emission: { enabled: true, maskedColors: [9] },
		},
	},
	{
		name: "post/bloom-fullscreen-transparent",
		model: "pig",
		settings: { backgroundColor: TRANSPARENT_BLACK },
		extras: { bloom: { enabled: true, modelOnly: false } },
	},
	{
		name: "post/dithering",
		model: "pirate",
		extras: {
			dithering: {
				enabled: true,
				amount: 0.6,
				blend: 0.8,
				channelAmount: [1, 0.5, 0.2],
			},
		},
	},
	{
		name: "post/color-tint",
		model: "rig",
		extras: { colorTint: { enabled: true, intensity: 0.7 } },
	},
	{
		name: "post/color-tint-duotone-masked",
		model: "pig",
		extras: {
			colorTint: {
				enabled: true,
				mode: "duotone",
				blend: 0.8,
				maskedColors: [9],
			},
		},
	},
	// Video effects
	{
		name: "post/video-crt",
		model: "pig",
		extras: { videoEffects: { enabled: true, modelOnly: false } },
	},
	{
		name: "post/video-crt-refresh-fade-time",
		model: "rig",
		extras: {
			videoEffects: {
				enabled: true,
				modelOnly: false,
				resolution: 64,
				contrastBoost: 0.5,
				crt: {
					curvature: 1,
					scanlineIntensity: 0.8,
					refreshRate: 2,
					pixelFadeTime: 0.5,
				},
			},
		},
		warmupFrames: 4,
		time: 0.2,
	},
	{
		name: "post/video-lcd",
		model: "pig",
		extras: {
			videoEffects: {
				enabled: true,
				screenType: "lcd",
				resolution: 64,
				gridStrength: 1,
			},
		},
	},
	{
		name: "post/video-tn",
		model: "rig",
		extras: {
			videoEffects: { enabled: true, screenType: "tn", tn: { angleShift: 1 } },
		},
	},
	{
		name: "post/video-oled-pentile",
		model: "pig",
		extras: {
			videoEffects: {
				enabled: true,
				screenType: "oled",
				oled: { blackCrush: 0.8, pentile: true },
				saturation: 1.5,
			},
		},
	},
	{
		name: "post/video-gameboy-dmg-ghosting",
		model: "pig",
		extras: {
			videoEffects: { enabled: true, screenType: "gameboy", modelOnly: false },
			meshDeform: { enabled: true, twist: { amount: 0.5, speed: 2 } },
		},
		warmupFrames: 6,
		frameStep: 1 / 30,
	},
	{
		name: "post/video-gameboy-pocket",
		model: "rig",
		extras: {
			videoEffects: {
				enabled: true,
				screenType: "gameboy",
				gameboy: { palette: "pocket", ghosting: 0 },
			},
		},
	},
	{
		name: "post/video-gameboy-custom",
		model: "pirate",
		extras: {
			videoEffects: {
				enabled: true,
				screenType: "gameboy",
				resolution: 48,
				gameboy: {
					palette: "custom",
					ghosting: 0,
					customColors: [
						[0.1, 0, 0.2],
						[0.5, 0.1, 0.4],
						[0.9, 0.4, 0.5],
						[1, 0.9, 0.8],
					],
				},
			},
		},
	},
	{
		name: "post/video-projector",
		model: "livingroom",
		extras: {
			videoEffects: {
				enabled: true,
				modelOnly: false,
				screenType: "projector",
				brightness: 1.3,
				projector: { keystone: 0.5, hotspot: 0.8, halo: 0.6 },
			},
		},
	},
	{
		name: "post/crt-legacy-alias",
		model: "pig",
		extras: { crt: { enabled: true, curvature: 0.8, scanlineIntensity: 0.6 } },
	},
	// Screen-space distortions
	{
		name: "post/pixelation-square",
		model: "rig",
		extras: { pixelation: { enabled: true, pixelSize: 6 } },
	},
	{
		name: "post/pixelation-hex-blend",
		model: "pig",
		extras: {
			pixelation: { enabled: true, shape: "hex", pixelSize: 5, blend: 0.6 },
		},
	},
	{
		name: "post/pixelation-circle-masked",
		model: "pig",
		extras: {
			pixelation: {
				enabled: true,
				shape: "circle",
				pixelSize: 8,
				maskedColors: [9],
			},
		},
	},
	{
		name: "post/pixelation-diamond-fullscreen",
		model: "rig",
		extras: {
			pixelation: {
				enabled: true,
				shape: "diamond",
				pixelSize: 7,
				modelOnly: false,
			},
		},
	},
	{
		name: "post/lens-distortion",
		model: "livingroom",
		extras: {
			lensDistortion: {
				enabled: true,
				modelOnly: false,
				strength: 0.6,
				zoom: 1.5,
			},
		},
	},
	{
		name: "post/lens-distortion-negative",
		model: "pig",
		extras: { lensDistortion: { enabled: true, strength: -0.5, zoom: 1 } },
	},
	{
		name: "post/noise-time",
		model: "pig",
		extras: { noise: { enabled: true, amount: 0.3 } },
		time: 0.5,
	},
	{
		name: "post/noise-masked-fullscreen",
		model: "rig",
		extras: {
			noise: {
				enabled: true,
				amount: 0.5,
				modelOnly: false,
				maskedColors: [7],
			},
		},
		time: 0.5,
	},
	{
		name: "post/chromatic-aberration",
		model: "pig",
		extras: { chromaticAberration: { enabled: true, strength: 3 } },
	},
	{
		name: "post/chromatic-aberration-offcenter-non-square",
		model: "rig",
		resolution: { width: 160, height: 100 },
		extras: {
			chromaticAberration: {
				enabled: true,
				modelOnly: false,
				strength: 2,
				redOffset: -1,
				greenOffset: 1,
				blueOffset: 0.5,
				radialFalloff: 0.5,
				centerX: 0.3,
				centerY: 0.7,
			},
		},
	},
	{
		name: "post/vignette",
		model: "pirate",
		extras: { vignette: { enabled: true, modelOnly: false } },
	},
	{
		name: "post/vignette-ellipse-colored-non-square",
		model: "pig",
		resolution: { width: 160, height: 90 },
		extras: {
			vignette: {
				enabled: true,
				modelOnly: false,
				roundness: 0,
				smoothness: 0.9,
				color: [0.3, 0, 0.3],
			},
		},
	},
	// Depth fog
	{
		name: "post/depth-fog-linear",
		model: "livingroom",
		extras: { depthFog: { enabled: true, near: 15, far: 25 } },
	},
	{
		name: "post/depth-fog-exponential-fullscreen",
		model: "rig",
		extras: {
			depthFog: {
				enabled: true,
				mode: "exponential",
				density: 0.15,
				modelOnly: false,
				color: [0.1, 0.1, 0.2],
			},
		},
	},
	{
		name: "post/depth-fog-exponential-squared-ortho",
		model: "livingroom",
		settings: { projectionMode: "orthographic" },
		extras: {
			depthFog: { enabled: true, mode: "exponentialSquared", density: 0.01 },
		},
	},
	{
		name: "post/depth-fog-masked",
		model: "pig",
		extras: {
			depthFog: { enabled: true, near: 5, far: 12, maskedColors: [9] },
		},
	},
	// Halftone
	{
		name: "post/halftone-dots",
		model: "pig",
		extras: { halftone: { enabled: true } },
	},
	{
		name: "post/halftone-lines",
		model: "rig",
		extras: {
			halftone: { enabled: true, mode: "lines", dotSize: 4, angle: 0.8 },
		},
	},
	{
		name: "post/halftone-crosshatch-blend",
		model: "pirate",
		extras: {
			halftone: {
				enabled: true,
				mode: "crosshatch",
				blend: 0.5,
				modelOnly: false,
			},
		},
	},
	// Glitch
	{
		name: "post/glitch-time",
		model: "pig",
		extras: { glitch: { enabled: true, intensity: 0.8 } },
		time: 1.25,
	},
	{
		name: "post/glitch-lines-only-masked",
		model: "rig",
		extras: {
			glitch: {
				enabled: true,
				rgbSplit: false,
				blockSize: 10,
				speed: 2,
				maskedColors: [7],
				modelOnly: false,
			},
		},
		time: 0.625,
	},
	{
		name: "post/glitch-rgb-only",
		model: "pig",
		extras: { glitch: { enabled: true, lineShift: false, intensity: 1 } },
		time: 1.25,
	},
	// Sharpen & edge detection
	{
		name: "post/sharpen",
		model: "rig",
		extras: { sharpen: { enabled: true, strength: 2 } },
	},
	{
		name: "post/sharpen-threshold-masked",
		model: "pig",
		extras: {
			sharpen: {
				enabled: true,
				strength: 3,
				threshold: 0.2,
				maskedColors: [9],
			},
		},
	},
	{
		name: "post/edge-detection",
		model: "pig",
		extras: { edgeDetection: { enabled: true } },
	},
	{
		name: "post/edge-detection-blend-fullscreen",
		model: "livingroom",
		extras: {
			edgeDetection: {
				enabled: true,
				modelOnly: false,
				threshold: 0.3,
				blend: 0.5,
				lineColor: [1, 0, 0],
				backgroundColor: [0, 0, 0.2],
			},
		},
	},
];

const combos: Scenario[] = [
	{
		name: "combo/material-stack-pig",
		model: "pig",
		settings: { backgroundColor: TRANSPARENT_BLACK, outlineSize: 1 },
		extras: {
			rimLight: { enabled: true },
			gradientLight: { enabled: true, source: "worldY" },
			specular: { enabled: true, environment: { strength: 0.5 } },
			glitter: { enabled: true, speed: 0 },
			emission: { enabled: true, maskedColors: [9], strength: 0.5 },
			fur: { enabled: true, length: 0.15 },
		},
	},
	{
		name: "combo/post-stack-rig",
		model: "rig",
		extras: {
			proceduralBackground: { enabled: true, pattern: "voronoi" },
			ssao: { enabled: true },
			gradientOutline: { enabled: true, size: 2 },
			bloom: { enabled: true },
			depthFog: { enabled: true, near: 4, far: 14 },
			colorGrading: { enabled: true, saturation: 1.4 },
			vignette: { enabled: true, modelOnly: false },
			videoEffects: { enabled: true, modelOnly: false, screenType: "lcd" },
		},
	},
	{
		name: "combo/geometry-stack-time",
		model: "helicopter_takeoff",
		extras: {
			meshDeform: {
				enabled: true,
				voxel: { enabled: true, gridSize: 0.4 },
				twist: { amount: 0.5 },
			},
			triangleFlash: { enabled: true },
			particles: { enabled: true, shape: "cube", count: 80 },
			billboard: { enabled: true, nodes: ["body"], mode: "yaw" },
		},
		animationTime: 2.5,
		time: 0.6,
	},
	{
		name: "combo/everything-masked",
		model: "pig",
		extras: {
			colorCutout: { enabled: true, maskedColors: [12] },
			paletteSwap: { enabled: true, map: [9, 12] },
			interior: { enabled: true, maskedColors: [9] },
			dissolve: { enabled: true, progress: 0.3, maskedColors: [9] },
			bloom: { enabled: true, maskedColors: [9] },
			pixelation: { enabled: true, maskedColors: [9] },
			halftone: { enabled: true, maskedColors: [9] },
			edgeDetection: { enabled: true, maskedColors: [9] },
			colorTint: { enabled: true, maskedColors: [9] },
			sharpen: { enabled: true, maskedColors: [9] },
			glitch: { enabled: true, maskedColors: [9] },
			noise: { enabled: true, maskedColors: [9] },
			depthFog: { enabled: true, near: 4, far: 12, maskedColors: [9] },
			dithering: { enabled: true, maskedColors: [9] },
			posterization: { enabled: true, maskedColors: [9] },
			chromaticAberration: { enabled: true, maskedColors: [9] },
		},
		time: 0.4,
	},
	{
		name: "combo/scaled-full-viewport",
		model: "pirate",
		resolution: { width: 96, height: 96, scale: 2 },
		settings: { scanlines: true, leftTag: { text: "combo" } },
		extras: {
			proceduralBackground: { enabled: true, pattern: "stars" },
			videoEffects: { enabled: true, modelOnly: false, screenType: "crt" },
			gradientOutline: { enabled: true, mode: "dropShadow" },
		},
	},
];

const nodes: Scenario[] = [
	{
		name: "nodes/rim-light-front-bumper",
		model: "rig",
		extras: {
			rimLight: { enabled: true, style: "smooth", nodes: ["front bumper"] },
		},
	},
	{
		name: "nodes/gradient-light-cab",
		model: "rig",
		extras: {
			gradientLight: {
				enabled: true,
				source: "screenY",
				style: "smooth",
				blend: 1,
				nodes: ["cab"],
			},
		},
	},
	{
		name: "nodes/specular-fuel-tank",
		model: "rig",
		extras: {
			specular: {
				enabled: true,
				style: "smooth",
				strength: 1,
				nodes: ["fuel tank"],
			},
		},
	},
	{
		name: "nodes/glitter-step",
		model: "rig",
		extras: {
			glitter: {
				enabled: true,
				style: "smooth",
				density: 24,
				speed: 0,
				nodes: ["step"],
			},
		},
	},
	{
		name: "nodes/emission-fuel-tank",
		model: "rig",
		extras: { emission: { enabled: true, nodes: ["fuel tank"] } },
	},
	{
		name: "nodes/interior-front-bumper",
		model: "rig",
		extras: {
			interior: { enabled: true, pattern: "grid", nodes: ["front bumper"] },
		},
	},
	{
		name: "nodes/dissolve-cab",
		model: "rig",
		extras: { dissolve: { enabled: true, progress: 0.6, nodes: ["cab"] } },
	},
	{
		name: "nodes/voxel-sweep-cab",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				progress: 0.5,
				sweep: { mode: "directional", direction: [0, 1, 0] },
				voxel: { enabled: true, gridSize: 0.3 },
				nodes: ["cab"],
			},
		},
	},
	{
		name: "nodes/vertex-glitch-cab",
		model: "rig",
		extras: {
			vertexGlitch: { enabled: true, density: 0.8, nodes: ["cab"] },
		},
		time: 0.3,
	},
	{
		name: "nodes/projection-cab",
		model: "rig",
		extras: {
			projection: {
				enabled: true,
				mode: "tint",
				color: [0, 1, 0],
				facing: 0,
				nodes: ["cab"],
			},
		},
	},
	{
		name: "nodes/cutout-step",
		model: "rig",
		extras: {
			colorCutout: {
				enabled: true,
				maskedColors: [7, 12, 6, 1, 3, 15],
				nodes: ["step"],
			},
		},
	},
	{
		name: "nodes/fur-front-bumper",
		model: "rig",
		extras: { fur: { enabled: true, length: 0.3, nodes: ["front bumper"] } },
	},
	{
		name: "nodes/flash-fuel-tank",
		model: "rig",
		extras: {
			triangleFlash: { enabled: true, density: 1, nodes: ["fuel tank"] },
		},
		time: 0.05,
	},
	{
		name: "nodes/shatter-back-wheels",
		model: "rig",
		extras: {
			triangleShatter: {
				enabled: true,
				progress: 0.5,
				nodes: ["wheel.1", "wheel.2", "wheel.3", "wheel.4"],
			},
		},
	},
	{
		name: "nodes/twist-front-bumper",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				twist: { amount: 2 },
				nodes: ["front bumper"],
			},
		},
	},
	{
		name: "nodes/voxel-cab-only",
		model: "rig",
		extras: {
			meshDeform: {
				enabled: true,
				voxel: { enabled: true, gridSize: 0.3 },
				nodes: ["cab"],
			},
		},
	},
	{
		name: "nodes/color-within-node",
		model: "rig",
		extras: {
			rimLight: {
				enabled: true,
				style: "smooth",
				maskedColors: [12],
				nodes: ["cab"],
			},
		},
	},
	{
		name: "nodes/billboard-default-groups",
		model: "rig",
		settings: { camera: { omega: 2.4, theta: 0.6 } },
		extras: { billboard: { enabled: true } },
	},
	{
		name: "nodes/group-lamps",
		model: "rig",
		extras: { emission: { enabled: true, nodes: ["lamps"] } },
	},
	{
		name: "nodes/group-inheritance",
		model: "helicopter_takeoff",
		extras: {
			rimLight: {
				enabled: true,
				style: "smooth",
				width: 0.6,
				nodes: ["handle"],
			},
		},
		animationTime: 1,
	},
	{
		name: "nodes/unknown-name-is-noop",
		model: "rig",
		extras: {
			rimLight: { enabled: true, style: "smooth", nodes: ["no such node"] },
			fur: { enabled: true, nodes: ["no such node"] },
			meshDeform: {
				enabled: true,
				voxel: { enabled: true },
				twist: { amount: 2 },
				nodes: ["no such node"],
			},
		},
	},
];

export const SCENARIOS: readonly Scenario[] = [
	...core,
	...material,
	...geometry,
	...post,
	...nodes,
	...combos,
];
