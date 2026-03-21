import type { Color3, ProjectionMode, RenderMode } from "./scene.ts";

/** Configuration options for the PicoCAD 2 viewer. */
export interface PicoCAD2ViewerOptions {
	canvas?: HTMLCanvasElement;
	shading?: boolean;
	renderMode?: RenderMode;
	projectionMode?: ProjectionMode;
	wireframe?: boolean;
	wireframeColor?: Color3;
	animationSpeed?: number;
	resolution?: {
		width: number;
		height: number;
		scale?: number;
	};
}
