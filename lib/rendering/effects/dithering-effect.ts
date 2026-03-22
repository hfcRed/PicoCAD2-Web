import ditheringFrag from "../../shaders/effects/dithering.frag";
import type { Color3 } from "../../types/scene.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Applies 4x4 Bayer matrix dithering with per-channel control.
 */
export class DitheringEffect extends FullscreenEffect {
	amount = 1.0;
	blend = 1.0;
	channelAmount: Color3 = [1, 1, 1];

	/**
	 * Creates a new dithering effect.
	 */
	constructor() {
		super("dithering", ditheringFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the dithering shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_amount: this.amount,
			u_resolution: [ctx.width, ctx.height],
			u_blend: this.blend,
			u_channelAmount: this.channelAmount,
		};
	}
}
