import type { EmissionOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

export type EmissionBlinkMode = "smooth" | "pulse";

/**
 * Makes the masked palette colors emissive. Their texels ignore shading
 * and render fullbright. Palette style claims the lit shade row through
 * the dither gate (and the index G-buffer's shade row follows), so the
 * output stays palette-pure. smooth style blends toward the lit color instead.
 *
 * Two animations modulate the emission. Blink dips the strength from
 * full down to {@link blinkMin} at {@link blinkRate} Hz ("smooth" sine
 * or hard "pulse"). Scroll runs lit band waves through the model along
 * a world direction. It activates when {@link scrollGap} is above zero.
 * Pair with `bloom.maskedColors` on the same indices for a glow halo.
 */
export class EmissionEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, EMISSION_DEFAULTS);
	}
}

export interface EmissionEffect extends Required<EmissionOptions> {}

/** Default settings for {@link EmissionEffect}. */
export const EMISSION_DEFAULTS = deepFreeze<DeepRequired<EmissionOptions>>({
	enabled: false,
	strength: 1,
	blinkMode: "smooth",
	blinkRate: 0,
	blinkMin: 0,
	scrollDirection: [0, 1, 0],
	scrollWidth: 0.25,
	scrollGap: 0,
	scrollSpeed: 1,
	style: "palette",
	maskedColors: [],
	nodes: [],
});
