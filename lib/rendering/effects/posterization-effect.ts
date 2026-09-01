import posterizationFrag from "../../shaders/effects/posterization.frag";
import type { PosterizationOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";

/**
 * Reduces the number of color levels, creating a banded/posterized look.
 */
export class PosterizationEffect extends FullscreenEffect {
	/**
	 * Creates a new posterization effect.
	 */
	constructor() {
		super("posterization", posterizationFrag, () => this.getUniforms());
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, POSTERIZATION_DEFAULTS);
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

export interface PosterizationEffect extends Required<PosterizationOptions> {}

/** Default settings for {@link PosterizationEffect}. */
export const POSTERIZATION_DEFAULTS = deepFreeze<
	DeepRequired<PosterizationOptions>
>({
	enabled: false,
	modelOnly: true,
	levels: 8,
	channelLevels: [1, 1, 1],
	gamma: 1,
	colorBanding: false,
	maskedColors: [],
});
