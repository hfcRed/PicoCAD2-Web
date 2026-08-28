import type { MaterialStyle } from "./material-style.ts";

export type EmissionBlinkMode = "smooth" | "pulse";

/**
 * Makes the masked palette colors emissive. Their texels ignore shading
 * and render fullbright. Palette style claims the lit shade row through
 * the dither gate (and the index G-buffer's shade row follows), so the
 * output stays palette-pure. smooth style blends toward the lit color instead.
 *
 * Two animations modulate the emission. Blink dips the strength from
 * full down to {@link blinkMin} at {@link blinkRate} Hz ("smooth" sine
 * or hard "pulse"). Scroll runs lit band waves through the model along
 * a world direction. It activates when {@link scrollGap} is above zero.
 * Pair with `bloom.maskedColors` on the same indices for a glow halo.
 */
export class EmissionEffect {
	enabled = false;
	strength = 1;
	blinkMode: EmissionBlinkMode = "smooth";
	blinkRate = 0;
	blinkMin = 0;
	scrollDirection: [number, number, number] = [0, 1, 0];
	scrollWidth = 0.25;
	scrollGap = 0;
	scrollSpeed = 1;
	style: MaterialStyle = "palette";
	maskedColors: number[] = [];
}
