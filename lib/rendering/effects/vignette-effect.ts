import vignetteFrag from "../../shaders/effects/vignette.frag";
import type { VignetteOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Darkens the edges of the viewport with a configurable vignette.
 */
export class VignetteEffect extends FullscreenEffect {
	/**
	 * Creates a new vignette effect.
	 */
	constructor() {
		super("vignette", vignetteFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, VIGNETTE_DEFAULTS);
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

export interface VignetteEffect extends Required<VignetteOptions> {}

/** Default settings for {@link VignetteEffect}. */
export const VIGNETTE_DEFAULTS = deepFreeze<DeepRequired<VignetteOptions>>({
	enabled: false,
	modelOnly: true,
	intensity: 1,
	smoothness: 0.5,
	roundness: 1,
	color: [0, 0, 0],
});
