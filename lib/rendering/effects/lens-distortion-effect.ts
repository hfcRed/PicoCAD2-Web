import lensDistortionFrag from "../../shaders/effects/lens-distortion.frag";
import type { LensDistortionOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";

/**
 * Applies barrel or pincushion lens distortion.
 */
export class LensDistortionEffect extends FullscreenEffect {
	/**
	 * Creates a new lens distortion effect.
	 */
	constructor() {
		super("lensDistortion", lensDistortionFrag, () => this.getUniforms(), true);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, LENS_DISTORTION_DEFAULTS);
	}

	/**
	 * Returns the uniform values for the lens distortion shader.
	 *
	 * @returns The uniform values.
	 */
	private getUniforms(): Record<string, unknown> {
		return {
			u_strength: this.strength,
			u_zoom: this.zoom,
		};
	}
}

export interface LensDistortionEffect extends Required<LensDistortionOptions> {}

/** Default settings for {@link LensDistortionEffect}. */
export const LENS_DISTORTION_DEFAULTS = deepFreeze<
	DeepRequired<LensDistortionOptions>
>({
	enabled: false,
	modelOnly: true,
	strength: 0,
	zoom: 2,
});
