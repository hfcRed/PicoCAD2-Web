import type { InteriorOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

export type InteriorPattern =
	| "stars"
	| "dust"
	| "voronoi"
	| "lava"
	| "grid"
	| "truchet"
	| "constellations";

export const INTERIOR_PATTERN_ID: Record<InteriorPattern, number> = {
	stars: 0,
	dust: 1,
	voronoi: 2,
	lava: 3,
	grid: 4,
	truchet: 5,
	constellations: 6,
};

/**
 * Fake depth behind selected palette colors, applied inside the model
 * shader. For masked texels the view ray is marched a few steps into the
 * surface and a procedural 3D field is sampled at each depth with
 * parallax that tracks the camera. Unlike the other material effects the
 * masked texels are replaced entirely.
 */
export class InteriorEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, INTERIOR_DEFAULTS);
	}
}

export interface InteriorEffect extends Required<InteriorOptions> {}

/** Default settings for {@link InteriorEffect}. */
export const INTERIOR_DEFAULTS = deepFreeze<DeepRequired<InteriorOptions>>({
	enabled: false,
	pattern: "stars",
	depth: 2,
	layers: 3,
	scale: 4,
	speed: 1,
	color: [1, 1, 1],
	backgroundColor: [0.06, 0.05, 0.13],
	randomHue: false,
	hueRange: 0.5,
	style: "palette",
	maskedColors: [],
});
