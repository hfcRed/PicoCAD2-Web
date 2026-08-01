import vignetteFrag from "../../shaders/effects/vignette.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Darkens the edges of the viewport with a configurable vignette.
 */
export class VignetteEffect extends FullscreenEffect {
	intensity = 1.0;
	smoothness = 0.5;
	roundness = 1.0;
	color: [number, number, number] = [0, 0, 0];

	/**
	 * Creates a new vignette effect.
	 */
	constructor() {
		super("vignette", vignetteFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the vignette shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_intensity: this.intensity,
			u_smoothness: this.smoothness,
			u_roundness: this.roundness,
			u_color: this.color,
			u_resolution: [ctx.width, ctx.height],
		};
	}
}
