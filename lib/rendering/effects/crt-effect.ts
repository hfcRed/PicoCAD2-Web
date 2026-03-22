import crtFrag from "../../shaders/effects/crt.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Applies CRT barrel distortion and scanline effects.
 */
export class CRTEffect extends FullscreenEffect {
	curvature = 0.5;
	scanlineIntensity = 0.3;

	/**
	 * Creates a new CRT effect.
	 */
	constructor() {
		super("crt", crtFrag, (ctx: EffectContext) => this.getUniforms(ctx));
	}

	/**
	 * Returns the uniform values for the CRT shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_curvature: this.curvature,
			u_scanlineIntensity: this.scanlineIntensity,
			u_resolution: [ctx.width, ctx.height],
		};
	}
}
