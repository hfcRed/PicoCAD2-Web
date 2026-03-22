import pixelationFrag from "../../shaders/effects/pixelation.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

export type PixelShape =
	| "square"
	| "hex"
	| "circle"
	| "diamond"
	| "triangle"
	| "cross"
	| "star";

const SHAPE_MAP: Record<PixelShape, number> = {
	square: 0,
	hex: 1,
	circle: 2,
	diamond: 3,
	triangle: 4,
	cross: 5,
	star: 6,
};

/**
 * Applies pixelation with multiple shape modes.
 */
export class PixelationEffect extends FullscreenEffect {
	pixelSize = 4.0;
	shape: PixelShape = "square";
	blend = 1.0;

	/**
	 * Creates a new pixelation effect.
	 */
	constructor() {
		super("pixelation", pixelationFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the pixelation shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_pixelSize: this.pixelSize,
			u_resolution: [ctx.width, ctx.height],
			u_blend: this.blend,
			u_shape: SHAPE_MAP[this.shape],
		};
	}
}
