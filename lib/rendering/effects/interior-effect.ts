import type { Color3 } from "../../types/scene.ts";
import type { MaterialStyle } from "./material-style.ts";

export type InteriorPattern = "stars" | "dust" | "voronoi" | "lava" | "grid";

/**
 * Fake depth behind selected palette colors, applied inside the model
 * shader. For masked texels the view ray is marched a few steps into the
 * surface and a procedural 3D field is sampled at each depth with
 * parallax that tracks the camera. Unlike the other material effects the
 * masked texels are replaced entirely.
 */
export class InteriorEffect {
	enabled = false;
	pattern: InteriorPattern = "stars";
	depth = 2;
	layers = 3;
	scale = 4;
	speed = 1;
	color: Color3 = [1, 1, 1];
	backgroundColor: Color3 = [0.06, 0.05, 0.13];
	style: MaterialStyle = "palette";
	maskedColors: number[] = [];
}
