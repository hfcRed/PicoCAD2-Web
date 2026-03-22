import type { PicoCAD2Context } from "../context.ts";
import type { CameraMode, Color3, ProjectionMode, RenderMode } from "./scene.ts";

export interface PicoCAD2ViewerOptions {
	canvas?: HTMLCanvasElement;
	context?: PicoCAD2Context;
	shading?: boolean;
	renderMode?: RenderMode;
	projectionMode?: ProjectionMode;
	wireframe?: boolean;
	wireframeColor?: Color3;
	animationSpeed?: number;
	cameraMode?: CameraMode;
	cameraModeSpeed?: number;
	cameraModeDirection?: "left" | "right";
	resolution?: {
		width: number;
		height: number;
		scale?: number;
	};
}
