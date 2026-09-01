import type { FurOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
/**
 * Shell-textured fur grown from the model's surfaces. The renderer draws
 * the model again as a stack of instanced shells offset along smoothed
 * (position-averaged) normals. A hash-noise cutout in the fragment
 * stage carves the shells into strand cross-sections.
 *
 * Unlike the other geometry effects, the mask is per texel. The strand
 * cutout samples the index texture, so fur only grows where the surface
 * is painted with the masked colors. Fur follows the mesh deform and
 * hides while a triangle shatter is in progress.
 */
export class FurEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, FUR_DEFAULTS);
	}
}

export interface FurEffect extends Required<FurOptions> {}

/** Default settings for {@link FurEffect}. */
export const FUR_DEFAULTS = deepFreeze<DeepRequired<FurOptions>>({
	enabled: false,
	length: 0.1,
	layers: 8,
	density: 40,
	gravity: [0, 0, 0],
	rootShade: 1,
	maskedColors: [],
});
