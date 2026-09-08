import colorGradingFrag from "../../shaders/effects/color-grading.frag";
import type { ColorGradingOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";

/**
 * Adjusts brightness, contrast, saturation, and hue of the scene.
 */
export class ColorGradingEffect extends FullscreenEffect {
	/**
	 * Creates a new color grading effect.
	 */
	constructor() {
		super("colorGrading", colorGradingFrag, () => this.getUniforms());
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, COLOR_GRADING_DEFAULTS);
	}

	/**
	 * Returns the uniform values for the color grading shader.
	 *
	 * @returns The uniform values.
	 */
	private getUniforms(): Record<string, unknown> {
		return {
			u_brightness: this.brightness,
			u_contrast: this.contrast,
			u_saturation: this.saturation,
			u_hue: this.hue / 360,
		};
	}
}

export interface ColorGradingEffect extends Required<ColorGradingOptions> {}

/** Default settings for {@link ColorGradingEffect}. */
export const COLOR_GRADING_DEFAULTS = deepFreeze<
	DeepRequired<ColorGradingOptions>
>({
	enabled: false,
	modelOnly: true,
	brightness: 1,
	contrast: 1,
	saturation: 1,
	hue: 0,
	maskedColors: [],
});
