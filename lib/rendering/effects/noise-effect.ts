import noiseFrag from "../../shaders/effects/noise.frag";
import type { NoiseOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Adds animated film grain noise to the scene.
 */
export class NoiseEffect extends FullscreenEffect {
	/**
	 * Creates a new noise effect.
	 */
	constructor() {
		super("noise", noiseFrag, (ctx: EffectContext) => this.getUniforms(ctx));
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, NOISE_DEFAULTS);
	}

	/**
	 * Returns the uniform values for the noise shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_amount: this.amount,
			u_time: ctx.time,
		};
	}
}

export interface NoiseEffect extends Required<NoiseOptions> {}

/** Default settings for {@link NoiseEffect}. */
export const NOISE_DEFAULTS = deepFreeze<DeepRequired<NoiseOptions>>({
	enabled: false,
	modelOnly: true,
	amount: 0.05,
	maskedColors: [],
});
