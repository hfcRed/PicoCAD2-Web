import type { DisplayOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import {
	DMG_COLORS,
	type GameboyPalette,
	type ScreenType,
} from "./video-effects-effect.ts";

export type DisplaySpace = "uv" | "screen";

/**
 * Turns the masked materials into screens, with the simulation the video
 * effects post effect runs over the whole frame. Six screen types behind
 * one {@link screenType} switch, the shared tone and grid controls, and
 * the per-type settings that work on a surface.
 *
 * In `"uv"` {@link space} the surface is the screen. The virtual pixel
 * grid lies on the texture, scanlines run along texel rows, the subpixel
 * structure sits inside each cell, and a {@link resolution} coarser than
 * the texture shows a coarser image, since the texel lookup snaps to the
 * cell centers. In `"screen"` space the structure follows the output
 * pixels like the post effect, without resampling the image. Warps, the
 * projector's halo and ghosting need the whole frame and stay with the
 * post effect.
 *
 * A screen's response is an RGB transform, so the display has no style
 * and leaves the palette.
 */
export class DisplayEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, DISPLAY_DEFAULTS);
	}
}

export interface DisplayEffect extends Required<DisplayOptions> {
	crt: { scanlineIntensity: number; refreshRate: number };
	gameboy: { palette: GameboyPalette; customColors: Color3[] };
	tn: { angleShift: number };
	oled: { blackCrush: number; pentile: boolean };
	projector: { hotspot: number };
}

/** Default settings for {@link DisplayEffect}. */
export const DISPLAY_DEFAULTS = deepFreeze<DeepRequired<DisplayOptions>>({
	enabled: false,
	space: "uv",
	screenType: "crt" as ScreenType,
	resolution: 128,
	brightness: 1,
	saturation: 1,
	contrastBoost: 0,
	gridStrength: 0.5,
	crt: { scanlineIntensity: 0.3, refreshRate: 0 },
	gameboy: {
		palette: "dmg",
		customColors: DMG_COLORS.map((c): Color3 => [...c]),
	},
	tn: { angleShift: 0.5 },
	oled: { blackCrush: 0.5, pentile: false },
	projector: { hotspot: 0.4 },
	maskedColors: [],
	nodes: [],
});
