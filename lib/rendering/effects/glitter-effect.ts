import type { GlitterOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

/**
 * The space sparkle cells live in. `"uv"` quantizes sparkles to the
 * 128x128 texel grid (chunky, on-aesthetic), `"screen"` gives smooth
 * screen-space sparkle, and `"world"` glues sparkles to the surface
 * under animation.
 */
export type GlitterSpace = "uv" | "screen" | "world";

export type GlitterShape = "square" | "circle";

/**
 * View-angle triggered sparkles, applied inside the model shader. The
 * surface is divided into hashed cells, each holding a random facet
 * direction; a cell sparkles while the view direction aligns with its
 * facet, so sparkles pop in and out as the camera orbits, plus a per-cell
 * twinkle over time.
 */
export class GlitterEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, GLITTER_DEFAULTS);
	}
}

export interface GlitterEffect extends Required<GlitterOptions> {}

/** Default settings for {@link GlitterEffect}. */
export const GLITTER_DEFAULTS = deepFreeze<DeepRequired<GlitterOptions>>({
	enabled: false,
	space: "uv",
	density: 48,
	size: 0.6,
	color: [1, 1, 1],
	randomHue: false,
	hueRange: 0.5,
	brightness: 1,
	angleRange: 40,
	speed: 1,
	shape: "square",
	style: "palette",
	maskedColors: [],
});
