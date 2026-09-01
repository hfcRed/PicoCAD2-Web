import type { TriangleFlashOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

export type TriangleFlashMode = "replace" | "add";

/**
 * Random triangles blink a color for a moment. Time is divided into buckets at `rate` Hz.
 * Each bucket a random `density` fraction of triangles flashes for `duration`
 * seconds. Flashing triangles keep their base index in the index buffer,
 * so a blink never leaves other effects' masks.
 */
export class TriangleFlashEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, TRIANGLE_FLASH_DEFAULTS);
	}
}

export interface TriangleFlashEffect extends Required<TriangleFlashOptions> {}

/** Default settings for {@link TriangleFlashEffect}. */
export const TRIANGLE_FLASH_DEFAULTS = deepFreeze<
	DeepRequired<TriangleFlashOptions>
>({
	enabled: false,
	color: [1, 1, 1],
	rate: 8,
	density: 0.15,
	duration: 0.12,
	softness: 0,
	mode: "replace",
	style: "palette",
	maskedColors: [],
});
