import chromaticAberrationFrag from "../../shaders/effects/chromatic-aberration.frag";
import type { ChromaticAberrationOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

/**
 * Separates RGB channels radially from screen center for a chromatic aberration look.
 */
export class ChromaticAberrationEffect extends FullscreenEffect {
	/**
	 * Creates a new chromatic aberration effect.
	 */
	constructor() {
		super(
			"chromaticAberration",
			chromaticAberrationFrag,
			(ctx: EffectContext) => this.getUniforms(ctx),
			true,
		);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, CHROMATIC_ABERRATION_DEFAULTS);
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

export interface ChromaticAberrationEffect
	extends Required<ChromaticAberrationOptions> {}

/** Default settings for {@link ChromaticAberrationEffect}. */
export const CHROMATIC_ABERRATION_DEFAULTS = deepFreeze<
	DeepRequired<ChromaticAberrationOptions>
>({
	enabled: false,
	modelOnly: true,
	strength: 1,
	redOffset: 1,
	greenOffset: 0,
	blueOffset: -1,
	radialFalloff: 1.5,
	centerX: 0.5,
	centerY: 0.5,
	maskedColors: [],
});
