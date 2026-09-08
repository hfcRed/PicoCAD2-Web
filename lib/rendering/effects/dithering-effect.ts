import ditheringFrag from "../../shaders/effects/dithering.frag";
import type { DitheringOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Applies 4x4 Bayer matrix dithering with per-channel control.
 */
export class DitheringEffect extends FullscreenEffect {
	/**
	 * Creates a new dithering effect.
	 */
	constructor() {
		super("dithering", ditheringFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, DITHERING_DEFAULTS);
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

export interface DitheringEffect extends Required<DitheringOptions> {}

/** Default settings for {@link DitheringEffect}. */
export const DITHERING_DEFAULTS = deepFreeze<DeepRequired<DitheringOptions>>({
	enabled: false,
	modelOnly: true,
	amount: 1,
	blend: 1,
	channelAmount: [1, 1, 1],
	maskedColors: [],
});
