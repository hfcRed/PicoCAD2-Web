import type { PicoCAD2Context } from "../context.ts";
import type { BillboardMode } from "../rendering/effects/billboard-effect.ts";
import type { ColorTintMode } from "../rendering/effects/color-tint-effect.ts";
import type { CycleMode } from "../rendering/effects/cycle.ts";
import type { FogMode } from "../rendering/effects/depth-fog-effect.ts";
import type { DeepPartial } from "../rendering/effects/effect-defaults.ts";
import type { EmissionBlinkMode } from "../rendering/effects/emission-effect.ts";
import type {
	GlitterShape,
	GlitterSpace,
} from "../rendering/effects/glitter-effect.ts";
import type { GradientLightSource } from "../rendering/effects/gradient-light-effect.ts";
import type { OutlineMode } from "../rendering/effects/gradient-outline-effect.ts";
import type { HalftoneMode } from "../rendering/effects/halftone-effect.ts";
import type { InteriorPattern } from "../rendering/effects/interior-effect.ts";
import type { MaterialStyle } from "../rendering/effects/material-style.ts";
import type { DeformAxis } from "../rendering/effects/mesh-deform-effect.ts";
import type {
	ParticleMotion,
	ParticleShape,
} from "../rendering/effects/particles-effect.ts";
import type { PixelShape } from "../rendering/effects/pixelation-effect.ts";
import type { BackgroundPattern } from "../rendering/effects/procedural-background-effect.ts";
import type {
	ProjectionEffectMode,
	ProjectionPattern,
} from "../rendering/effects/projection-effect.ts";
import type { SSAOSamples } from "../rendering/effects/ssao-effect.ts";
import type { SweepMode } from "../rendering/effects/sweep.ts";
import type { TriangleFlashMode } from "../rendering/effects/triangle-flash-effect.ts";
import type { TriangleShatterMode } from "../rendering/effects/triangle-shatter-effect.ts";
import type { VertexGlitchUnit } from "../rendering/effects/vertex-glitch-effect.ts";
import type {
	GameboyPalette,
	ScreenType,
} from "../rendering/effects/video-effects-effect.ts";
import type { RawPicoCAD2File } from "./model.ts";
import type { CameraMode, Color3, ProjectionMode } from "./scene.ts";

export interface WireframeOptions {
	enabled?: boolean;
	color?: Color3;
}

export interface ParticlesOptions {
	enabled?: boolean;
	count?: number;
	shape?: ParticleShape;
	paletteIndices?: number[];
	size?: number;
	sizeJitter?: number;
	motion?: ParticleMotion;
	speed?: number;
	velocity?: [number, number, number];
	areaScale?: number;
	twinkle?: number;
	randomHue?: boolean;
	hueRange?: number;
}

export interface ProceduralBackgroundOptions {
	enabled?: boolean;
	pattern?: BackgroundPattern;
	colorA?: Color3;
	colorB?: Color3;
	scale?: number;
	speed?: number;
	seed?: number;
	cameraParallax?: number;
	randomHue?: boolean;
	hueRange?: number;
	style?: MaterialStyle;
}

export interface GradientOutlineOptions {
	enabled?: boolean;
	size?: number;
	colorFrom?: Color3;
	colorTo?: Color3;
	gradient?: number;
	gradientDirection?: number;
	growthDirection?: number;
	growthFactor?: number;
	mode?: OutlineMode;
	shadowOffset?: [number, number];
}

export interface SSAOOptions {
	enabled?: boolean;
	radius?: number;
	intensity?: number;
	power?: number;
	samples?: SSAOSamples;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface ColorGradingOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	brightness?: number;
	contrast?: number;
	saturation?: number;
	hue?: number;
	maskedColors?: number[];
}

export interface PosterizationOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	levels?: number;
	channelLevels?: Color3;
	gamma?: number;
	colorBanding?: boolean;
	maskedColors?: number[];
}

export interface BloomOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	threshold?: number;
	intensity?: number;
	blur?: number;
	maskedColors?: number[];
}

export interface DitheringOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	amount?: number;
	blend?: number;
	channelAmount?: Color3;
	maskedColors?: number[];
}

export interface VideoEffectsOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	screenType?: ScreenType;
	resolution?: number;
	brightness?: number;
	saturation?: number;
	contrastBoost?: number;
	gridStrength?: number;
	crt?: {
		curvature?: number;
		scanlineIntensity?: number;
		refreshRate?: number;
		pixelFadeTime?: number;
	};
	gameboy?: {
		palette?: GameboyPalette;
		customColors?: Color3[];
		ghosting?: number;
	};
	tn?: { angleShift?: number };
	oled?: { blackCrush?: number; pentile?: boolean };
	projector?: { keystone?: number; hotspot?: number; halo?: number };
}

export interface PixelationOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	pixelSize?: number;
	shape?: PixelShape;
	blend?: number;
	maskedColors?: number[];
}

export interface LensDistortionOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	strength?: number;
	zoom?: number;
}

export interface NoiseOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	amount?: number;
	maskedColors?: number[];
}

export interface ChromaticAberrationOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	strength?: number;
	redOffset?: number;
	greenOffset?: number;
	blueOffset?: number;
	radialFalloff?: number;
	centerX?: number;
	centerY?: number;
	maskedColors?: number[];
}

export interface VignetteOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	intensity?: number;
	smoothness?: number;
	roundness?: number;
	color?: Color3;
}

export interface DepthFogOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	color?: Color3;
	near?: number;
	far?: number;
	density?: number;
	mode?: FogMode;
	maskedColors?: number[];
}

export interface HalftoneOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	dotSize?: number;
	angle?: number;
	blend?: number;
	mode?: HalftoneMode;
	maskedColors?: number[];
}

export interface GlitchOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	intensity?: number;
	speed?: number;
	blockSize?: number;
	rgbSplit?: boolean;
	lineShift?: boolean;
	maskedColors?: number[];
}

export interface ColorTintOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	mode?: ColorTintMode;
	color?: Color3;
	intensity?: number;
	shadowColor?: Color3;
	highlightColor?: Color3;
	blend?: number;
	maskedColors?: number[];
}

export interface SharpenOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	strength?: number;
	threshold?: number;
	maskedColors?: number[];
}

export interface EdgeDetectionOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	threshold?: number;
	lineColor?: Color3;
	backgroundColor?: Color3;
	blend?: number;
	maskedColors?: number[];
}

export interface ColorCutoutOptions {
	nodes?: string[];
	enabled?: boolean;
	maskedColors?: number[];
}

export interface CycleOptions {
	enabled?: boolean;
	mode?: CycleMode;
	duration?: number;
	hold?: number;
}

export interface SweepOptions {
	mode?: SweepMode;
	direction?: [number, number, number];
	point?: [number, number, number];
	scale?: number;
	softness?: number;
	wave?: number;
	invert?: boolean;
}

export interface DissolveOptions {
	nodes?: string[];
	enabled?: boolean;
	progress?: number;
	cycle?: CycleOptions;
	sweep?: SweepOptions;
	edgeWidth?: number;
	edgeColor?: Color3;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface EmissionOptions {
	nodes?: string[];
	enabled?: boolean;
	strength?: number;
	blinkMode?: EmissionBlinkMode;
	blinkRate?: number;
	blinkMin?: number;
	scrollDirection?: [number, number, number];
	scrollWidth?: number;
	scrollGap?: number;
	scrollSpeed?: number;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface ProjectionOptions {
	nodes?: string[];
	enabled?: boolean;
	pattern?: ProjectionPattern;
	direction?: [number, number, number];
	mode?: ProjectionEffectMode;
	color?: Color3;
	scale?: number;
	speed?: number;
	seed?: number;
	strength?: number;
	facing?: number;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface PaletteSwapOptions {
	enabled?: boolean;
	map?: number[];
	cycleIndices?: number[];
	cycleSpeed?: number;
	cycleStyle?: MaterialStyle;
	cycleBlendTime?: number;
}

export interface InteriorOptions {
	nodes?: string[];
	enabled?: boolean;
	pattern?: InteriorPattern;
	depth?: number;
	layers?: number;
	scale?: number;
	speed?: number;
	seed?: number;
	color?: Color3;
	backgroundColor?: Color3;
	randomHue?: boolean;
	hueRange?: number;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface RimLightOptions {
	nodes?: string[];
	enabled?: boolean;
	color?: Color3;
	width?: number;
	sharpness?: number;
	lightAlign?: number;
	blend?: number;
	invert?: boolean;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface GradientLightOptions {
	nodes?: string[];
	enabled?: boolean;
	litColor?: Color3;
	shadowColor?: Color3;
	source?: GradientLightSource;
	blend?: number;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface SpecularEnvironmentOptions {
	strength?: number;
	skyColor?: Color3;
	groundColor?: Color3;
	horizon?: number;
	fresnel?: number;
}

export interface SpecularOptions {
	nodes?: string[];
	enabled?: boolean;
	strength?: number;
	smoothness?: number;
	color?: Color3;
	anisotropy?: number;
	environment?: SpecularEnvironmentOptions;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface GlitterOptions {
	nodes?: string[];
	enabled?: boolean;
	space?: GlitterSpace;
	density?: number;
	size?: number;
	color?: Color3;
	randomHue?: boolean;
	hueRange?: number;
	brightness?: number;
	angleRange?: number;
	speed?: number;
	shape?: GlitterShape;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface FurOptions {
	nodes?: string[];
	enabled?: boolean;
	length?: number;
	layers?: number;
	density?: number;
	gravity?: [number, number, number];
	rootShade?: number;
	maskedColors?: number[];
}

export interface BillboardOptions {
	enabled?: boolean;
	nodes?: string[];
	mode?: BillboardMode;
}

export interface FloorOptions {
	enabled?: boolean;
	surface?: boolean;
	infinite?: boolean;
	offset?: number;
	size?: number;
	color?: Color3;
	fade?: number;
	grid?: {
		enabled?: boolean;
		spacing?: number;
		thickness?: number;
		color?: Color3;
	};
	shadow?: {
		enabled?: boolean;
		direction?: [number, number, number];
		color?: Color3;
		strength?: number;
		softness?: number;
	};
	reflection?: { enabled?: boolean; strength?: number };
	style?: MaterialStyle;
}

export interface MeshDeformOptions {
	nodes?: string[];
	enabled?: boolean;
	progress?: number;
	cycle?: CycleOptions;
	sweep?: SweepOptions;
	voxel?: { enabled?: boolean; gridSize?: number };
	barrel?: { amount?: number; axis?: DeformAxis };
	spherify?: { amount?: number };
	twist?: { amount?: number; axis?: DeformAxis };
}

export interface TriangleFlashOptions {
	nodes?: string[];
	enabled?: boolean;
	color?: Color3;
	rate?: number;
	density?: number;
	duration?: number;
	softness?: number;
	mode?: TriangleFlashMode;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface TriangleShatterOptions {
	nodes?: string[];
	enabled?: boolean;
	progress?: number;
	cycle?: CycleOptions;
	sweep?: SweepOptions;
	mode?: TriangleShatterMode;
	direction?: [number, number, number];
	distance?: number;
	spread?: number;
	rotation?: number;
	gravity?: number;
	shrink?: number;
	maskedColors?: number[];
}

export interface VertexGlitchOptions {
	nodes?: string[];
	enabled?: boolean;
	progress?: number;
	cycle?: CycleOptions;
	sweep?: SweepOptions;
	unit?: VertexGlitchUnit;
	strength?: number;
	rate?: number;
	density?: number;
	duration?: number;
	softness?: number;
	maskedColors?: number[];
}

export interface ExtrasOptions {
	wireframe?: WireframeOptions;
	particles?: ParticlesOptions;
	proceduralBackground?: ProceduralBackgroundOptions;
	colorCutout?: ColorCutoutOptions;
	dissolve?: DissolveOptions;
	paletteSwap?: PaletteSwapOptions;
	interior?: InteriorOptions;
	rimLight?: RimLightOptions;
	gradientLight?: GradientLightOptions;
	specular?: SpecularOptions;
	glitter?: GlitterOptions;
	emission?: EmissionOptions;
	projection?: ProjectionOptions;
	fur?: FurOptions;
	meshDeform?: MeshDeformOptions;
	triangleFlash?: TriangleFlashOptions;
	triangleShatter?: TriangleShatterOptions;
	vertexGlitch?: VertexGlitchOptions;
	billboard?: BillboardOptions;
	floor?: FloorOptions;
	gradientOutline?: GradientOutlineOptions;
	ssao?: SSAOOptions;
	colorGrading?: ColorGradingOptions;
	posterization?: PosterizationOptions;
	bloom?: BloomOptions;
	dithering?: DitheringOptions;
	videoEffects?: VideoEffectsOptions;
	pixelation?: PixelationOptions;
	lensDistortion?: LensDistortionOptions;
	noise?: NoiseOptions;
	chromaticAberration?: ChromaticAberrationOptions;
	vignette?: VignetteOptions;
	depthFog?: DepthFogOptions;
	halftone?: HalftoneOptions;
	glitch?: GlitchOptions;
	colorTint?: ColorTintOptions;
	sharpen?: SharpenOptions;
	edgeDetection?: EdgeDetectionOptions;
}

export interface ModelInfo {
	nodeCount: number;
	polyCount: number;
	animationDuration: number;
	hasAnimation: boolean;
	backgroundColor: Color3;
	transparentColor: Color3;
	palette: Color3[];
	/** The settings the file carries, as `load()` applied them. */
	settings: ModelSettings;
}

export interface CameraControlOptions {
	zoom?: boolean;
	pan?: boolean;
	rotate?: boolean;
	spinInertiaFactor?: number;
	useFixedOnInteract?: {
		enabled: boolean;
		delayBeforeRestore: number;
		restoreTime: number;
	};
}

export interface AnimationSettings {
	time: number;
	playing: boolean;
	loops: number;
}

export interface CameraSettings {
	omega: number;
	theta: number;
	distanceToTarget: number;
	target: [number, number, number];
	zoom: number;
}

export interface ResolutionSettings {
	width: number;
	height: number;
	scale: number;
}

export interface BookmarkSettings {
	omega: number;
	theta: number;
	distanceToTarget: number;
	target: [number, number, number];
}

export interface CameraDistanceClamp {
	enabled: boolean;
	minimumDistance: number;
}

export interface ModelSettings {
	shadingMode: number;
	renderMode: number;
	projectionMode: ProjectionMode;
	outlineSize: number;
	outlineColor: Color3;
	scanlines: boolean;
	scanlineColor: Color3;
	cameraMode: CameraMode;
	cameraModeSpeed: number;
	cameraModeDirection: "left" | "right";
	leftTag: { text: string; color?: Color3 } | null;
	rightTag: { text: string; color?: Color3 } | null;
	animation: AnimationSettings;
	camera: CameraSettings;
	bookmark: BookmarkSettings;
}

export interface ViewerSettings {
	backgroundColor: Color3 | null;
	resolution: ResolutionSettings;
	maxFps: number;
	clampCameraDistance: CameraDistanceClamp;
	animationSpeed: number;
	animationLoop: boolean;
}

export type ExtrasState = Required<ExtrasOptions>;

export interface PicoCAD2ViewerState {
	source: RawPicoCAD2File | null;
	model?: DeepPartial<ModelSettings>;
	viewer?: DeepPartial<ViewerSettings>;
	extras?: ExtrasOptions;
}

export interface PicoCAD2ViewerOptions {
	canvas?: HTMLCanvasElement;
	context?: PicoCAD2Context;
	shadingMode?: number;
	renderMode?: number;
	projectionMode?: ProjectionMode;
	backgroundColor?: Color3 | null;
	outlineSize?: number;
	outlineColor?: Color3;
	scanlines?: boolean;
	scanlineColor?: Color3;
	animationSpeed?: number;
	cameraMode?: CameraMode;
	cameraModeSpeed?: number;
	cameraModeDirection?: "left" | "right";
	resolution?: {
		width: number;
		height: number;
		scale?: number;
	};
	maxFps?: number;
	clampCameraDistance?: Partial<CameraDistanceClamp>;
	extras?: ExtrasOptions;
	onLoad?: ((info: ModelInfo) => void) | null;
	onFrame?: ((dt: number) => void) | null;
	onDispose?: (() => void) | null;
}
