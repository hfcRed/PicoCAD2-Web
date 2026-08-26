import type { Color3 } from "../../types/scene.ts";

/**
 * How a material effect writes its result.
 *
 * `"palette"` keeps every output pixel a palette entry: effect colors are
 * snapped to the nearest palette color on the CPU and soft intensities are
 * checkerboard-dithered in the shader, the same implementation the shading
 * system uses. `"smooth"` does plain RGB blending instead.
 */
export type MaterialStyle = "palette" | "smooth";

/**
 * Finds the palette entry closest to a color, using luma-weighted distance.
 *
 * @param color - The color to match.
 * @param colors - The model palette as interleaved RGB floats.
 * @returns The nearest palette index.
 */
export function nearestPaletteIndex(
	color: Color3,
	colors: Float32Array,
): number {
	let best = 0;
	let bestDist = Infinity;
	const count = Math.min(16, colors.length / 3);
	for (let i = 0; i < count; i++) {
		const dr = colors[i * 3] - color[0];
		const dg = colors[i * 3 + 1] - color[1];
		const db = colors[i * 3 + 2] - color[2];
		const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
		if (dist < bestDist) {
			bestDist = dist;
			best = i;
		}
	}
	return best;
}

/**
 * Writes an effect color into a uniform array: snapped to the nearest
 * palette entry for the palette style, passed through for smooth.
 *
 * @param out - The uniform array to write into.
 * @param color - The configured effect color.
 * @param style - The effect's material style.
 * @param colors - The model palette as interleaved RGB floats.
 */
export function writeStyledColor(
	out: Color3,
	color: Color3,
	style: MaterialStyle,
	colors: Float32Array,
): void {
	if (style === "palette") {
		const idx = nearestPaletteIndex(color, colors);
		out[0] = colors[idx * 3];
		out[1] = colors[idx * 3 + 1];
		out[2] = colors[idx * 3 + 2];
	} else {
		out[0] = color[0];
		out[1] = color[1];
		out[2] = color[2];
	}
}
