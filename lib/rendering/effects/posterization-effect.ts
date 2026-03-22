import posterizationFrag from "../../shaders/effects/posterization.frag";
import type { Color3 } from "../../types/scene.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";

/**
 * Reduces the number of color levels, creating a banded/posterized look.
 */
export class PosterizationEffect extends FullscreenEffect {
	levels = 8;
	channelLevels: Color3 = [1, 1, 1];
	gamma = 1.0;
	colorBanding = false;

	/**
	 * Creates a new posterization effect.
	 */
	constructor() {
		super("posterization", posterizationFrag, () => this.getUniforms());
	}

	/**
	 * Returns the uniform values for the posterization shader.
	 *
	 * @returns The uniform values.
	 */
	private getUniforms(): Record<string, unknown> {
		return {
			u_levels: this.levels,
			u_channelLevels: this.channelLevels,
			u_gamma: this.gamma,
			u_colorBanding: this.colorBanding,
		};
	}
}
