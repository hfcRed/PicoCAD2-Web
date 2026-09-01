import type { ColorCutoutOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
/**
 * Discards model pixels whose base palette color is selected, making the
 * chosen colors render as additional transparent colors. Applied inside the
 * model shader rather than the post-process chain, so it works in every
 * render path and produces real holes: outlines, depth-based effects and
 * the palette index buffer all see the cutout.
 *
 * Unlike the `maskedColors` masks on post-process effects, an empty array
 * cuts nothing instead of selecting everything.
 */
export class ColorCutoutEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, COLOR_CUTOUT_DEFAULTS);
	}
}

export interface ColorCutoutEffect extends Required<ColorCutoutOptions> {}

/** Default settings for {@link ColorCutoutEffect}. */
export const COLOR_CUTOUT_DEFAULTS = deepFreeze<
	DeepRequired<ColorCutoutOptions>
>({
	enabled: false,
	maskedColors: [],
});
