import proceduralBackgroundFrag from "../../shaders/effects/procedural-background.frag";
import type { Color3 } from "../../types/scene.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import { type MaterialStyle, writeStyledColor } from "./material-style.ts";
import type { EffectContext } from "./types.ts";

export type BackgroundPattern =
	| "voronoi"
	| "truchet"
	| "stars"
	| "constellations"
	| "lava"
	| "dust"
	| "grid";

const PATTERN_FIELD_ID: Record<BackgroundPattern, number> = {
	stars: 0,
	dust: 1,
	voronoi: 2,
	lava: 3,
	grid: 4,
	truchet: 5,
	constellations: 6,
};

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
	pattern: BackgroundPattern = "stars";
	colorA: Color3 = [0.02, 0.02, 0.07];
	colorB: Color3 = [1, 1, 1];
	scale = 12;
	speed = 1;
	seed = 0;
	cameraParallax = 0.5;
	style: MaterialStyle = "smooth";

	private readonly styledA: Color3 = [0, 0, 0];
	private readonly styledB: Color3 = [0, 0, 0];

	/**
	 * Creates a new procedural background effect.
	 */
	constructor() {
		super("proceduralBackground", proceduralBackgroundFrag, (ctx) =>
			this.getUniforms(ctx),
		);
		this.modelOnly = false;
	}

	/**
	 * Returns the uniform values for the background shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		const snap = this.style === "palette" && ctx.palette.length >= 3;
		writeStyledColor(this.styledA, this.colorA, snap ? "palette" : "smooth", ctx.palette);
		writeStyledColor(this.styledB, this.colorB, snap ? "palette" : "smooth", ctx.palette);

		return {
			u_resolution: [ctx.width, ctx.height],
			u_time: ctx.time,
			u_pattern: PATTERN_FIELD_ID[this.pattern] ?? 0,
			u_colorA: this.styledA,
			u_colorB: this.styledB,
			u_scale: this.scale,
			u_speed: this.speed,
			u_seed: this.seed,
			u_parallax: this.cameraParallax,
			u_dither: this.style !== "smooth",
			u_camAzimuth: ctx.cameraAzimuth,
			u_camElevation: ctx.cameraElevation,
		};
	}
}
