/** Configuration options for the PicoCAD 2 viewer. */
export interface PicoCAD2ViewerOptions {
	canvas?: HTMLCanvasElement;
	shading?: boolean;
	renderMode?: "texture" | "color" | "none";
	wireframe?: boolean;
	wireframeColor?: [number, number, number];
	animationSpeed?: number;
	resolution?: {
		width: number;
		height: number;
		scale?: number;
	};
}
