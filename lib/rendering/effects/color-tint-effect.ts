import colorTintFrag from "../../shaders/effects/color-tint.frag";
import type { ColorTintOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";

/** Color tint rendering mode. */
export type ColorTintMode = "tint" | "duotone";

const COLOR_TINT_MODE_MAP: Record<ColorTintMode, number> = {
	tint: 0,
	duotone: 1,
};

/**
 * Applies a color tint or duotone mapping to the scene.
 */
export class ColorTintEffect extends FullscreenEffect {
	/**
	 * Creates a new color tint effect.
	 */
	constructor() {
		super("colorTint", colorTintFrag, () => this.getUniforms());
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, COLOR_TINT_DEFAULTS);
	}

	/**
	 * Returns the uniform values for the color tint shader.
	 *
	 * @returns The uniform values.
	 */
	private getUniforms(): Record<string, unknown> {
		return {
			u_mode: COLOR_TINT_MODE_MAP[this.mode],
			u_color: this.color,
			u_intensity: this.intensity,
			u_shadowColor: this.shadowColor,
			u_highlightColor: this.highlightColor,
			u_blend: this.blend,
		};
	}
}

export interface ColorTintEffect extends Required<ColorTintOptions> {}

/** Default settings for {@link ColorTintEffect}. */
export const COLOR_TINT_DEFAULTS = deepFreeze<DeepRequired<ColorTintOptions>>({
	enabled: false,
	modelOnly: true,
	mode: "tint",
	color: [1, 0.9, 0.7],
	intensity: 1,
	shadowColor: [0, 0, 0.2],
	highlightColor: [1, 1, 0.8],
	blend: 1,
	maskedColors: [],
});
