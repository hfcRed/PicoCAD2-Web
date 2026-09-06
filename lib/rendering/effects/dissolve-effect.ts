import type {
	CycleOptions,
	DissolveOptions,
	SweepOptions,
} from "../../types/options.ts";
import { CYCLE_DEFAULTS } from "./cycle.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

/**
 * Dissolves the model texel by texel as {@link progress} runs from 0
 * (intact) to 1 (gone), punching holes like the color cutout, so
 * outlines, depth effects and the index G-buffer all see them. Fur
 * strands dissolve with their base surface.
 *
 * The {@link sweep} decides which texels go first, defaulting to "noise".
 * A uniform sweep has no front, so the whole surface fades through the
 * checkerboard at once and shows no edge. Every other mode gives each
 * texel the local progress the front has reached there, and survivors
 * near the cut show a dithered {@link edgeColor} band, {@link edgeWidth}
 * wide.
 *
 * {@link cycle} runs the progress from 0 to 1 and back automatically over
 * the elapsed time, ignoring the manual value while enabled.
 */
export class DissolveEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, DISSOLVE_DEFAULTS);
	}
}

export interface DissolveEffect extends Required<DissolveOptions> {
	cycle: Required<CycleOptions>;
	sweep: Required<SweepOptions>;
}

/** Default settings for {@link DissolveEffect}. */
export const DISSOLVE_DEFAULTS = deepFreeze<DeepRequired<DissolveOptions>>({
	enabled: false,
	progress: 0,
	cycle: { ...CYCLE_DEFAULTS },
	sweep: {
		mode: "noise",
		direction: [0, 1, 0],
		point: [0, 0, 0],
		scale: 8,
		softness: 0.15,
		wave: 0,
		invert: false,
	},
	edgeWidth: 0.1,
	edgeColor: [1, 0.65, 0.2],
	style: "palette",
	maskedColors: [],
	nodes: [],
});
