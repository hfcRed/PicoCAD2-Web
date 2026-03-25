import edgeDetectionFrag from "../../shaders/effects/edge-detection.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Full-screen edge detection using the Sobel operator for a sketch/technical drawing look.
 */
export class EdgeDetectionEffect extends FullscreenEffect {
	threshold = 0.1;
	lineColor: [number, number, number] = [0, 0, 0];
	backgroundColor: [number, number, number] = [1, 1, 1];
	blend = 1.0;

	/**
	 * Creates a new edge detection effect.
	 */
	constructor() {
		super("edgeDetection", edgeDetectionFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the edge detection shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_threshold: this.threshold,
			u_lineColor: this.lineColor,
			u_backgroundColor: this.backgroundColor,
			u_blend: this.blend,
			u_resolution: [ctx.width, ctx.height],
		};
	}
}
