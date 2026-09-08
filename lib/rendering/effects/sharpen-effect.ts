import sharpenFrag from "../../shaders/effects/sharpen.frag";
import type { SharpenOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Sharpens the image using a Laplacian convolution kernel.
 */
export class SharpenEffect extends FullscreenEffect {
	/**
	 * Creates a new sharpen effect.
	 */
	constructor() {
		super("sharpen", sharpenFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, SHARPEN_DEFAULTS);
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

export interface SharpenEffect extends Required<SharpenOptions> {}

/** Default settings for {@link SharpenEffect}. */
export const SHARPEN_DEFAULTS = deepFreeze<DeepRequired<SharpenOptions>>({
	enabled: false,
	modelOnly: true,
	strength: 1,
	threshold: 0,
	maskedColors: [],
});
