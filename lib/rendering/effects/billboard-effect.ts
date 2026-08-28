export type BillboardMode = "full" | "yaw";

/**
 * Turns selected scene nodes toward the camera. Applied by the renderer
 * as CPU matrix surgery after the scene graph update. The rotation basis
 * of each selected node's world matrix is replaced with a camera-facing
 * one, keeping translation and scale.
 *
 * Children inherit the billboarded frame, and billboard wins over
 * animated rotation on the same node. The wireframe shares the world
 * matrices, so it follows automatically.
 */
export class BillboardEffect {
	enabled = false;
	nodes: string[] = [];
	mode: BillboardMode = "full";
}
