import noiseFrag from "../../shaders/effects/noise.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Adds animated film grain noise to the scene.
 */
export class NoiseEffect extends FullscreenEffect {
	amount = 0.05;

	/**
	 * Creates a new noise effect.
	 */
	constructor() {
		super("noise", noiseFrag, (ctx: EffectContext) => this.getUniforms(ctx));
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
