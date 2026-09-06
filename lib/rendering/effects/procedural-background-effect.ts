import proceduralBackgroundFrag from "../../shaders/effects/procedural-background.frag";
import type { ProceduralBackgroundOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import { writeStyledColor } from "./material-style.ts";
import { PATTERN_ID, type PatternName } from "./patterns.ts";
import type { EffectContext } from "./types.ts";

export type BackgroundPattern = PatternName;

/**
 * Fills background pixels with a procedural pattern.
 * Runs early in the post chain, so fog, outlines and
 * screen simulations apply over the pattern. `cameraParallax` rotates
 * the pattern with the orbit camera, turning it into a skybox.
 *
 * The `style` follows the material effects. `"palette"` snaps `colorA`
 * and `colorB` to the model's palette and binarizes the field through
 * the checkerboard, so every background pixel is one of two palette
 * entries. `"dithered"` binarizes with the configured colors as-is.
 * `"smooth"` (the default) blends the two colors continuously.
 *
 * Does nothing over a transparent background. There is nothing to paint
 * on. Painted pixels count as content for later `modelOnly` passes.
 */
export class ProceduralBackgroundEffect extends FullscreenEffect {
	private readonly styledA: Color3 = [0, 0, 0];
	private readonly styledB: Color3 = [0, 0, 0];

	/**
	 * Creates a new procedural background effect.
	 */
	constructor() {
		super("proceduralBackground", proceduralBackgroundFrag, (ctx) =>
			this.getUniforms(ctx),
		);
		this.reset();
		this.modelOnly = false;
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, PROCEDURAL_BACKGROUND_DEFAULTS);
	}

	/**
	 * Returns the uniform values for the background shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		const snap = this.style === "palette" && ctx.palette.length >= 3;
		writeStyledColor(
			this.styledA,
			this.colorA,
			snap ? "palette" : "smooth",
			ctx.palette,
		);
		writeStyledColor(
			this.styledB,
			this.colorB,
			snap ? "palette" : "smooth",
			ctx.palette,
		);

		return {
			u_resolution: [ctx.width, ctx.height],
			u_time: ctx.time,
			u_pattern: PATTERN_ID[this.pattern] ?? 0,
			u_colorA: this.styledA,
			u_colorB: this.styledB,
			u_scale: this.scale,
			u_speed: this.speed,
			u_seed: this.seed,
			u_parallax: this.cameraParallax,
			u_dither: this.style !== "smooth",
			u_hueRange:
				this.randomHue && this.style !== "palette"
					? Math.max(this.hueRange, 0) * Math.PI
					: 0,
			u_camAzimuth: ctx.cameraAzimuth,
			u_camElevation: ctx.cameraElevation,
		};
	}
}

export interface ProceduralBackgroundEffect
	extends Required<ProceduralBackgroundOptions> {}

/** Default settings for {@link ProceduralBackgroundEffect}. */
export const PROCEDURAL_BACKGROUND_DEFAULTS = deepFreeze<
	DeepRequired<ProceduralBackgroundOptions>
>({
	enabled: false,
	pattern: "stars",
	colorA: [0.02, 0.02, 0.07],
	colorB: [1, 1, 1],
	scale: 12,
	speed: 1,
	seed: 0,
	cameraParallax: 0.5,
	randomHue: false,
	hueRange: 0.5,
	style: "smooth",
});
