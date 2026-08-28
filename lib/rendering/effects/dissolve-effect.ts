import type { Color3 } from "../../types/scene.ts";
import type { MaterialStyle } from "./material-style.ts";

export type DissolveMode = "noise" | "directional" | "point" | "proximity";

/**
 * Dissolves the model texel by texel as {@link progress} runs from 0
 * (intact) to 1 (gone), punching holes like the color cutout, so
 * outlines, depth effects and the index G-buffer all see them. Fur
 * strands dissolve with their base surface.
 *
 * The dissolve order comes from {@link mode}: "noise" removes hashed
 * mesh-space cells at random, "directional" sweeps a world-space plane
 * along {@link direction}, "point" grows a sphere from {@link point},
 * and "proximity" wipes front to back from the camera. {@link invert}
 * reverses the sweep. Survivors near the cut show a dithered
 * {@link edgeColor} band, {@link edgeWidth} wide.
 */
export class DissolveEffect {
	enabled = false;
	progress = 0;
	mode: DissolveMode = "noise";
	scale = 8;
	direction: [number, number, number] = [0, 1, 0];
	point: [number, number, number] = [0, 0, 0];
	invert = false;
	softness = 0.15;
	edgeWidth = 0.1;
	edgeColor: Color3 = [1, 0.65, 0.2];
	style: MaterialStyle = "palette";
	maskedColors: number[] = [];
}
