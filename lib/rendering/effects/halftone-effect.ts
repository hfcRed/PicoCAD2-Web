import halftoneFrag from "../../shaders/effects/halftone.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/** Halftone rendering mode. */
export type HalftoneMode = "dots" | "lines" | "crosshatch";

const HALFTONE_MODE_MAP: Record<HalftoneMode, number> = {
	dots: 0,
	lines: 1,
	crosshatch: 2,
};

/**
 * Converts the scene to a halftone dot/line pattern like newspaper printing.
 */
export class HalftoneEffect extends FullscreenEffect {
	dotSize = 6.0;
	angle = 0.4;
	blend = 1.0;
	mode: HalftoneMode = "dots";

	/**
	 * Creates a new halftone effect.
	 */
	constructor() {
		super("halftone", halftoneFrag, (ctx: EffectContext) =>
			this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the halftone shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_dotSize: this.dotSize,
			u_angle: this.angle,
			u_blend: this.blend,
			u_mode: HALFTONE_MODE_MAP[this.mode],
			u_resolution: [ctx.width, ctx.height],
		};
	}
}
