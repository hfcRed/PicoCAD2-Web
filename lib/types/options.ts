import type { PicoCAD2Context } from "../context.ts";
import type { PixelShape } from "../rendering/effects/pixelation-effect.ts";
import type {
	CameraMode,
	Color3,
	ProjectionMode,
	RenderMode,
} from "./scene.ts";

export interface WireframeOptions {
	enabled?: boolean;
	color?: Color3;
}

export interface GradientOutlineOptions {
	enabled?: boolean;
	size?: number;
	colorFrom?: Color3;
	colorTo?: Color3;
	gradient?: number;
	gradientDirection?: number;
}

export interface ColorGradingOptions {
	enabled?: boolean;
	brightness?: number;
	contrast?: number;
	saturation?: number;
	hue?: number;
}

export interface PosterizationOptions {
	enabled?: boolean;
	levels?: number;
	channelLevels?: Color3;
	gamma?: number;
	colorBanding?: boolean;
}

export interface BloomOptions {
	enabled?: boolean;
	threshold?: number;
	intensity?: number;
	blur?: number;
}

export interface DitheringOptions {
	enabled?: boolean;
	amount?: number;
	blend?: number;
	channelAmount?: Color3;
}

export interface CRTOptions {
	enabled?: boolean;
	curvature?: number;
	scanlineIntensity?: number;
}

export interface PixelationOptions {
	enabled?: boolean;
	pixelSize?: number;
	shape?: PixelShape;
	blend?: number;
}

export interface LensDistortionOptions {
	enabled?: boolean;
	strength?: number;
	zoom?: number;
}

export interface NoiseOptions {
	enabled?: boolean;
	amount?: number;
}

export interface ChromaticAberrationOptions {
	enabled?: boolean;
	strength?: number;
	redOffset?: number;
	greenOffset?: number;
	blueOffset?: number;
	radialFalloff?: number;
	centerX?: number;
	centerY?: number;
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
}

export interface ModelInfo {
	nodeCount: number;
	polyCount: number;
	animationDuration: number;
	hasAnimation: boolean;
}

export interface CameraSettings {
	omega: number;
	theta: number;
	distanceToTarget: number;
	target: [number, number, number];
	zoom: number;
}

export interface ViewerSettings {
	shading: boolean;
	renderMode: RenderMode;
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
	animationSpeed: number;
	animationTime: number;
	animationPlaying: boolean;
	animationLoop: boolean;
	camera: CameraSettings;
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
}
