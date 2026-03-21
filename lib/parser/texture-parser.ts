import type { RawColor, RawTexture } from "../types/model.ts";
import type { TextureData } from "../types/scene.ts";

/**
 * Extracts the red, green, and blue components from a raw color value.
 * Handles both array format [r, g, b] and object format {r, g, b}.
 *
 * @param color - The raw color value from the file.
 * @returns A tuple of [r, g, b] in 0-1 float range.
 */
function extractRGB(color: RawColor): [number, number, number] {
	if (Array.isArray(color)) {
		return [color[0], color[1], color[2]];
	}
	return [color.r, color.g, color.b];
}

/**
 * Computes the squared distance between two RGB colors.
 *
 * @param r1 - Red component of the first color.
 * @param g1 - Green component of the first color.
 * @param b1 - Blue component of the first color.
 * @param r2 - Red component of the second color.
 * @param g2 - Green component of the second color.
 * @param b2 - Blue component of the second color.
 * @returns The squared Euclidean distance between the two colors.
 */
function colorDistanceSq(
	r1: number,
	g1: number,
	b1: number,
	r2: number,
	g2: number,
	b2: number,
): number {
	const dr = r1 - r2;
	const dg = g1 - g2;
	const db = b1 - b2;
	return dr * dr + dg * dg + db * db;
}

/**
 * Finds the index of the nearest color in the palette to a given RGB value.
 *
 * @param r - Red component (0-1).
 * @param g - Green component (0-1).
 * @param b - Blue component (0-1).
 * @param colors - Flat RGB float array of palette colors.
 * @param count - Number of colors in the palette.
 * @returns The index of the nearest palette color.
 */
function findNearestColor(
	r: number,
	g: number,
	b: number,
	colors: Float32Array,
	count: number,
): number {
	let bestIndex = 0;
	let bestDist = Number.POSITIVE_INFINITY;

	for (let i = 0; i < count; i++) {
		const dist = colorDistanceSq(
			r,
			g,
			b,
			colors[i * 3],
			colors[i * 3 + 1],
			colors[i * 3 + 2],
		);
		if (dist < bestDist) {
			bestDist = dist;
			bestIndex = i;
		}
	}

	return bestIndex;
}

/**
 * Auto-generates a shade palette by darkening each color and finding the nearest match.
 *
 * @param colors - Flat RGB float array of palette colors.
 * @param count - Number of colors in the palette.
 * @param factor - Darkening factor (0-1, default 0.7 for shade_pal_1).
 * @returns A Uint8Array of palette indices mapping each color to its darkened variant.
 */
function autoGenerateShadePalette(
	colors: Float32Array,
	count: number,
	factor: number,
): Uint8Array {
	const palette = new Uint8Array(16);

	for (let i = 0; i < count; i++) {
		const r = colors[i * 3] * factor;
		const g = colors[i * 3 + 1] * factor;
		const b = colors[i * 3 + 2] * factor;
		palette[i] = findNearestColor(r, g, b, colors, count);
	}

	return palette;
}

/**
 * Parses the raw texture data from a PicoCAD 2 file into a GPU-ready format.
 *
 * @param raw - The raw texture data from the JSON file.
 * @returns Parsed texture data with pixel indices, palette colors, and shade palettes.
 */
export function parseTexture(raw: RawTexture): TextureData {
	const pixels = new Uint8Array(16384);
	for (let i = 0; i < raw.pixels.length && i < 16384; i++) {
		pixels[i] = Number.parseInt(raw.pixels[i], 16);
	}

	const colorCount = raw.colors.length;
	const colors = new Float32Array(colorCount * 3);
	for (let i = 0; i < colorCount; i++) {
		const [r, g, b] = extractRGB(raw.colors[i]);
		colors[i * 3] = r;
		colors[i * 3 + 1] = g;
		colors[i * 3 + 2] = b;
	}

	let shadePalette1: Uint8Array;
	if (raw.shade_pal_1) {
		shadePalette1 = new Uint8Array(raw.shade_pal_1);
	} else {
		shadePalette1 = autoGenerateShadePalette(colors, colorCount, 0.7);
	}

	let shadePalette2: Uint8Array;
	if (raw.shade_pal_2) {
		shadePalette2 = new Uint8Array(raw.shade_pal_2);
	} else {
		shadePalette2 = autoGenerateShadePalette(colors, colorCount, 0.42);
	}

	return {
		pixels,
		colors,
		shadePalette1,
		shadePalette2,
		backgroundColor: raw.background_color,
		transparentColor: raw.transparent_color,
	};
}
