import glitchFrag from "../../shaders/effects/glitch.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Simulates digital glitching with RGB splitting, line displacement,
 * and block corruption. Animated over time.
 */
export class GlitchEffect extends FullscreenEffect {
	intensity = 0.5;
	speed = 1.0;
	blockSize = 30.0;
	rgbSplit = true;
	lineShift = true;

	/**
	 * Creates a new glitch effect.
	 */
	constructor() {
		super("glitch", glitchFrag, (ctx: EffectContext) => this.getUniforms(ctx));
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
