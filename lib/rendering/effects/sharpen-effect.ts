import sharpenFrag from "../../shaders/effects/sharpen.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Sharpens the image using a Laplacian convolution kernel.
 */
export class SharpenEffect extends FullscreenEffect {
	strength = 1.0;
	threshold = 0.0;

	/**
	 * Creates a new sharpen effect.
	 */
	constructor() {
		super("sharpen", sharpenFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the sharpen shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_strength: this.strength,
			u_threshold: this.threshold,
			u_resolution: [ctx.width, ctx.height],
		};
	}
}
