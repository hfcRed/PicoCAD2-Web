export type TriangleShatterMode = "normal" | "radial" | "directional";

/**
 * Blows the model apart into its triangles. The host animates `progress`.
 * Rendering is forced double-sided while active, and the wireframe
 * hides during shatter.
 */
export class TriangleShatterEffect {
	enabled = false;
	progress = 0;
	mode: TriangleShatterMode = "normal";
	direction: [number, number, number] = [0, 1, 0];
	distance = 2;
	spread = 0.3;
	rotation = 1;
	gravity = 0;
	shrink = 0;
	maskedColors: number[] = [];
}
