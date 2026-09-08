import type { GradientLightOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

export type GradientLightSource = "light" | "worldY" | "screenY";

/**
 * Two-color tint ramp over the model, applied inside the model shader:
 * lit (or high) areas pull toward one color and shadowed (or low) areas
 * toward another like a "cool shadows, warm highlights" grade. In palette
 * style the two colors snap to palette entries and the transition band
 * dithers, so the grade stays in palette.
 */
export class GradientLightEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, GRADIENT_LIGHT_DEFAULTS);
	}
}

export interface GradientLightEffect extends Required<GradientLightOptions> {}

/** Default settings for {@link GradientLightEffect}. */
export const GRADIENT_LIGHT_DEFAULTS = deepFreeze<
	DeepRequired<GradientLightOptions>
>({
	enabled: false,
	litColor: [1, 0.92, 0.6],
	shadowColor: [0.35, 0.35, 0.7],
	source: "light",
	blend: 0.5,
	style: "palette",
	maskedColors: [],
	nodes: [],
});
