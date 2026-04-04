import type { PicoCAD2Context } from "../context.ts";
import type { ColorTintMode } from "../rendering/effects/color-tint-effect.ts";
import type { FogMode } from "../rendering/effects/depth-fog-effect.ts";
import type { HalftoneMode } from "../rendering/effects/halftone-effect.ts";
import type { PixelShape } from "../rendering/effects/pixelation-effect.ts";
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

export interface GradientOutlineOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	size?: number;
	colorFrom?: Color3;
	colorTo?: Color3;
	gradient?: number;
	gradientDirection?: number;
}

export interface ColorGradingOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	brightness?: number;
	contrast?: number;
	saturation?: number;
	hue?: number;
}

export interface PosterizationOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	levels?: number;
	channelLevels?: Color3;
	gamma?: number;
	colorBanding?: boolean;
}

export interface BloomOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	threshold?: number;
	intensity?: number;
	blur?: number;
}

export interface DitheringOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	amount?: number;
	blend?: number;
	channelAmount?: Color3;
}

export interface CRTOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	curvature?: number;
	scanlineIntensity?: number;
}

export interface PixelationOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	pixelSize?: number;
	shape?: PixelShape;
	blend?: number;
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
}

export interface HalftoneOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	dotSize?: number;
	angle?: number;
	blend?: number;
	mode?: HalftoneMode;
}

export interface GlitchOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	intensity?: number;
	speed?: number;
	blockSize?: number;
	rgbSplit?: boolean;
	lineShift?: boolean;
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
}

export interface SharpenOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	strength?: number;
	threshold?: number;
}

export interface EdgeDetectionOptions {
	enabled?: boolean;
	modelOnly?: boolean;
	threshold?: number;
	lineColor?: Color3;
	backgroundColor?: Color3;
	blend?: number;
}

export interface ExtrasOptions {
	wireframe?: WireframeOptions;
	gradientOutline?: GradientOutlineOptions;
	colorGrading?: ColorGradingOptions;
	posterization?: PosterizationOptions;
	bloom?: BloomOptions;
	dithering?: DitheringOptions;
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
}

export interface CameraControlOptions {
	zoom?: boolean;
	pan?: boolean;
	rotate?: boolean;
	spinInertiaFactor?: number;
	useFixedOnInteract?: {
		enabled: boolean;
		/** Delay in ms after the last interaction before restoring. */
		delayBeforeRestore: number;
		/** Duration in ms for the camera to interpolate back to the original position. */
		restoreTime: number;
	};
}

export interface AnimationSettings {
	speed: number;
	time: number;
	playing: boolean;
	loop: boolean;
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
	bookmark: BookmarkSettings;
}

export interface PicoCAD2ViewerState {
	source: string | null;
	settings: ViewerSettings;
	extras: Required<ExtrasOptions>;
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
	extras?: ExtrasOptions;
	onLoad?: ((info: ModelInfo) => void) | null;
	onFrame?: ((dt: number) => void) | null;
	onDispose?: (() => void) | null;
}
