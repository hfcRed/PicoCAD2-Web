import edgeDetectionFrag from "../../shaders/effects/edge-detection.frag";
import type { EdgeDetectionOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Full-screen edge detection using the Sobel operator for a sketch/technical drawing look.
 */
export class EdgeDetectionEffect extends FullscreenEffect {
	/**
	 * Creates a new edge detection effect.
	 */
	constructor() {
		super("edgeDetection", edgeDetectionFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, EDGE_DETECTION_DEFAULTS);
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

export interface EdgeDetectionEffect extends Required<EdgeDetectionOptions> {}

/** Default settings for {@link EdgeDetectionEffect}. */
export const EDGE_DETECTION_DEFAULTS = deepFreeze<
	DeepRequired<EdgeDetectionOptions>
>({
	enabled: false,
	modelOnly: true,
	threshold: 0.1,
	lineColor: [0, 0, 0],
	backgroundColor: [1, 1, 1],
	blend: 1,
	maskedColors: [],
});
