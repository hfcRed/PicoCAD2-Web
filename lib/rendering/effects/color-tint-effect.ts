import colorTintFrag from "../../shaders/effects/color-tint.frag";
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
	mode: ColorTintMode = "tint";
	color: [number, number, number] = [1.0, 0.9, 0.7];
	intensity = 1.0;
	shadowColor: [number, number, number] = [0.0, 0.0, 0.2];
	highlightColor: [number, number, number] = [1.0, 1.0, 0.8];
	blend = 1.0;

	/**
	 * Creates a new color tint effect.
	 */
	constructor() {
		super("colorTint", colorTintFrag, () => this.getUniforms());
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
