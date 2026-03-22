import lensDistortionFrag from "../../shaders/effects/lens-distortion.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";

/**
 * Applies barrel or pincushion lens distortion.
 */
export class LensDistortionEffect extends FullscreenEffect {
	strength = 0.0;
	zoom = 2.0;

	/**
	 * Creates a new lens distortion effect.
	 */
	constructor() {
		super("lensDistortion", lensDistortionFrag, () => this.getUniforms());
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
