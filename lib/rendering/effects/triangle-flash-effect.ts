import type { Color3 } from "../../types/scene.ts";
import type { MaterialStyle } from "./material-style.ts";

export type TriangleFlashMode = "replace" | "add";

/**
 * Random triangles blink a color for a moment. Time is divided into buckets at `rate` Hz.
 * Each bucket a random `density` fraction of triangles flashes for `duration`
 * seconds. Flashing triangles keep their base index in the index buffer,
 * so a blink never leaves other effects' masks.
 */
export class TriangleFlashEffect {
	enabled = false;
	color: Color3 = [1, 1, 1];
	rate = 8;
	density = 0.15;
	duration = 0.12;
	softness = 0;
	mode: TriangleFlashMode = "replace";
	style: MaterialStyle = "palette";
	maskedColors: number[] = [];
}
