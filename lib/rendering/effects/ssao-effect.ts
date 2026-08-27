import ssaoFrag from "../../shaders/effects/ssao.frag";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { MaterialStyle } from "./material-style.ts";
import type { EffectContext } from "./types.ts";

/** Allowed hemisphere kernel sizes. */
export type SSAOSamples = 8 | 16 | 32;

/**
 * Screen-space ambient occlusion with palette-aware darkening.
 *
 * Hemisphere-samples the scene depth buffer to estimate how enclosed each
 * model pixel is. The `"palette"` style (default) darkens by re-indexing
 * the pixel to a deeper shade row of the palette LUT, dithering fractional
 * levels with the shading system's checkerboard, so crevice darkening stays
 * within the model's 16 colors. `"smooth"` multiplies plain RGB instead.
 *
 * `maskedColors` acts as a receive-AO mask. Only the selected base palette
 * colors are darkened (empty = all). Only model pixels are ever affected.
 */
export class SSAOEffect extends FullscreenEffect {
	radius = 1;
	intensity = 1;
	power = 1;
	samples: SSAOSamples = 16;
	style: MaterialStyle = "palette";

	/**
	 * Creates a new SSAO effect.
	 */
	constructor() {
		super("ssao", ssaoFrag, (ctx: EffectContext) => this.getUniforms(ctx));
	}

	/**
	 * Returns the uniform values for the SSAO shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		return {
			u_depthTexture: ctx.depthTexture,
			u_paletteTexture: ctx.paletteTexture,
			u_proj: ctx.projectionMatrix,
			u_invProj: ctx.invProjectionMatrix,
			u_radius: Math.max(this.radius, 1e-4),
			u_intensity: Math.max(this.intensity, 0),
			u_power: Math.max(this.power, 1e-3),
			u_samples: this.samples === 8 || this.samples === 32 ? this.samples : 16,
			u_smooth: this.style === "smooth",
			u_orthographic: ctx.isOrthographic,
		};
	}
}
