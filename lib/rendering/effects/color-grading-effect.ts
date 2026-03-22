import colorGradingFrag from "../../shaders/effects/color-grading.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";

/**
 * Adjusts brightness, contrast, saturation, and hue of the scene.
 */
export class ColorGradingEffect extends FullscreenEffect {
	brightness = 1.0;
	contrast = 1.0;
	saturation = 1.0;
	hue = 0.0;

	/**
	 * Creates a new color grading effect.
	 */
	constructor() {
		super("colorGrading", colorGradingFrag, () => this.getUniforms());
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
			u_hue: this.hue,
		};
	}
}
