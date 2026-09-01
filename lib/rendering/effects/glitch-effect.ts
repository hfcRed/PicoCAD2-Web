import glitchFrag from "../../shaders/effects/glitch.frag";
import type { GlitchOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Simulates digital glitching with RGB splitting, line displacement,
 * and block corruption. Animated over time.
 */
export class GlitchEffect extends FullscreenEffect {
	/**
	 * Creates a new glitch effect.
	 */
	constructor() {
		super(
			"glitch",
			glitchFrag,
			(ctx: EffectContext) => this.getUniforms(ctx),
			true,
		);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, GLITCH_DEFAULTS);
	}

	/**
	 * Returns the uniform values for the glitch shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_intensity: this.intensity,
			u_speed: this.speed,
			u_blockSize: this.blockSize,
			u_rgbSplit: this.rgbSplit,
			u_lineShift: this.lineShift,
			u_time: ctx.time,
			u_resolution: [ctx.width, ctx.height],
		};
	}
}

export interface GlitchEffect extends Required<GlitchOptions> {}

/** Default settings for {@link GlitchEffect}. */
export const GLITCH_DEFAULTS = deepFreeze<DeepRequired<GlitchOptions>>({
	enabled: false,
	modelOnly: true,
	intensity: 0.5,
	speed: 1,
	blockSize: 30,
	rgbSplit: true,
	lineShift: true,
	maskedColors: [],
});
