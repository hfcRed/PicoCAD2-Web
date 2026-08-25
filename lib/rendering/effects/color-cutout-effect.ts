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
	enabled = false;
	maskedColors: number[] = [];
}
