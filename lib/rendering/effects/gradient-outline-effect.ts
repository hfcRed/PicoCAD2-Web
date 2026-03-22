import gradientOutlineFrag from "../../shaders/effects/gradient-outline.frag";
import type { Color3 } from "../../types/scene.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Gradient outline effect based on the picocad2 outline shader approach.
 * Uses single-pass radius search with directional gradient color mixing.
 *
 * When enabled, this effect automatically replaces the built-in solid outline —
 * the renderer skips the official outline pass.
 */
export class GradientOutlineEffect extends FullscreenEffect {
	size = 1;
	colorFrom: Color3 = [1, 1, 1];
	colorTo: Color3 = [0, 0, 0];
	gradient = 1.0;
	gradientDirection = 0;

	/**
	 * Background color, set by the renderer before applying.
	 * Not user configurable, derived from the model's background color.
	 */
	backgroundColor: Color3 = [0, 0, 0];

	/**
	 * Creates a new gradient outline effect.
	 */
	constructor() {
		super("gradientOutline", gradientOutlineFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the gradient outline shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_outlineSize: this.size,
			u_colorFrom: this.colorFrom,
			u_colorTo: this.colorTo,
			u_gradient: this.gradient,
			u_gradientDirection: this.gradientDirection,
			u_texelSize: [1 / ctx.width, 1 / ctx.height],
			u_backgroundColor: this.backgroundColor,
		};
	}
}
