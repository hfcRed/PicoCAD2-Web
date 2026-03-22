import chromaticAberrationFrag from "../../shaders/effects/chromatic-aberration.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Separates RGB channels radially from screen center for a chromatic aberration look.
 */
export class ChromaticAberrationEffect extends FullscreenEffect {
	strength = 1.0;
	redOffset = 1.0;
	greenOffset = 0.0;
	blueOffset = -1.0;
	radialFalloff = 1.5;
	centerX = 0.5;
	centerY = 0.5;

	/**
	 * Creates a new chromatic aberration effect.
	 */
	constructor() {
		super(
			"chromaticAberration",
			chromaticAberrationFrag,
			(ctx: EffectContext) => this.getUniforms(ctx),
		);
	}

	/**
	 * Returns the uniform values for the chromatic aberration shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_resolution: [ctx.width, ctx.height],
			u_amount: this.strength,
			u_redOffset: this.redOffset,
			u_greenOffset: this.greenOffset,
			u_blueOffset: this.blueOffset,
			u_radialFalloff: this.radialFalloff,
			u_center: [this.centerX, this.centerY],
		};
	}
}
