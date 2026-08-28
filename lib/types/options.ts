import type { PicoCAD2Context } from "../context.ts";
import type { BillboardMode } from "../rendering/effects/billboard-effect.ts";
import type { ColorTintMode } from "../rendering/effects/color-tint-effect.ts";
import type { FogMode } from "../rendering/effects/depth-fog-effect.ts";
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
import type { SSAOSamples } from "../rendering/effects/ssao-effect.ts";
import type { TriangleFlashMode } from "../rendering/effects/triangle-flash-effect.ts";
import type { TriangleShatterMode } from "../rendering/effects/triangle-shatter-effect.ts";
import type {
	GameboyPalette,
	ScreenType,
} from "../rendering/effects/video-effects-effect.ts";
import type {
	CameraMode,
	Color3,
	ProjectionMode,
	RenderMode,
} from "./scene.ts";

export interface WireframeOptions {
	enabled?: boolean;
	modelOnly?: boolean;
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
	areaScale?: number;
	twinkle?: number;
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
	dither?: boolean;
}

export interface GradientOutlineOptions {
	enabled?: boolean;
	modelOnly?: boolean;
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

/**
 * @deprecated Use {@link VideoEffectsOptions} (`videoEffects`) instead.
 * States containing only this key are mapped onto `videoEffects` with
 * `screenType: "crt"` on load.
 */
export interface CRTOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	curvature?: number;
	scanlineIntensity?: number;
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
	enabled?: boolean;
	maskedColors?: number[];
}

export interface PaletteSwapOptions {
	enabled?: boolean;
	map?: number[];
	cycleIndices?: number[];
	cycleSpeed?: number;
}

export interface InteriorOptions {
	enabled?: boolean;
	pattern?: InteriorPattern;
	depth?: number;
	layers?: number;
	scale?: number;
	speed?: number;
	color?: Color3;
	backgroundColor?: Color3;
	style?: MaterialStyle;
	maskedColors?: number[];
}

export interface RimLightOptions {
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

export interface MeshDeformOptions {
	enabled?: boolean;
	rounding?: { amount?: number; gridSize?: number };
	barrel?: { amount?: number; axis?: DeformAxis };
	spherify?: { amount?: number };
	twist?: { amount?: number; axis?: DeformAxis; speed?: number };
}

export interface TriangleFlashOptions {
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
	enabled?: boolean;
	progress?: number;
	mode?: TriangleShatterMode;
	direction?: [number, number, number];
	distance?: number;
	spread?: number;
	rotation?: number;
	gravity?: number;
	shrink?: number;
	maskedColors?: number[];
}

export interface ExtrasOptions {
	wireframe?: WireframeOptions;
	particles?: ParticlesOptions;
	proceduralBackground?: ProceduralBackgroundOptions;
	colorCutout?: ColorCutoutOptions;
	paletteSwap?: PaletteSwapOptions;
	interior?: InteriorOptions;
	rimLight?: RimLightOptions;
	gradientLight?: GradientLightOptions;
	specular?: SpecularOptions;
	glitter?: GlitterOptions;
	fur?: FurOptions;
	meshDeform?: MeshDeformOptions;
	triangleFlash?: TriangleFlashOptions;
	triangleShatter?: TriangleShatterOptions;
	billboard?: BillboardOptions;
	gradientOutline?: GradientOutlineOptions;
	ssao?: SSAOOptions;
	colorGrading?: ColorGradingOptions;
	posterization?: PosterizationOptions;
	bloom?: BloomOptions;
	dithering?: DitheringOptions;
	videoEffects?: VideoEffectsOptions;
	/** @deprecated Use `videoEffects` instead; accepted for legacy states. */
	crt?: CRTOptions;
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
	speed: number;
	time: number;
	playing: boolean;
	loop: boolean;
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

export interface ViewerSettings {
	shading: boolean;
	renderMode: RenderMode;
	projectionMode: ProjectionMode;
	backgroundColor: Color3 | null;
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
	resolution: ResolutionSettings;
	maxFps: number;
	clampCameraDistance: boolean;
	bookmark: BookmarkSettings;
}

export type ExtrasState = Omit<Required<ExtrasOptions>, "crt"> & {
	/** @deprecated Only present in states saved by older versions. */
	crt?: CRTOptions;
};

export interface PicoCAD2ViewerState {
	source: string | null;
	settings: ViewerSettings;
	extras: ExtrasState;
}

export interface PicoCAD2ViewerOptions {
	canvas?: HTMLCanvasElement;
	context?: PicoCAD2Context;
	shading?: boolean;
	renderMode?: RenderMode;
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
	clampCameraDistance?: boolean;
	extras?: ExtrasOptions;
	onLoad?: ((info: ModelInfo) => void) | null;
	onFrame?: ((dt: number) => void) | null;
	onDispose?: (() => void) | null;
}
