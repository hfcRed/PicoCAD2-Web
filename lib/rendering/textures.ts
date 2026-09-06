import type { TextureData } from "../types/scene.ts";

/**
 * Creates the 128x128 index texture from parsed pixel data.
 * Each pixel stores a palette index (0-15).
 * Uses R8 format (single red channel, 8 bits).
 *
 * @param gl - The WebGL 2 rendering context.
 * @param texture - The parsed texture data.
 * @returns The WebGL texture object.
 */
export function createIndexTexture(
	gl: WebGL2RenderingContext,
	texture: TextureData,
): WebGLTexture {
	const tex = gl.createTexture();
	if (!tex) throw new Error("Failed to create index texture");

	const data = new Uint8Array(128 * 128);
	for (let i = 0; i < 128 * 128; i++) {
		data[i] = texture.pixels[i];
	}

	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.R8,
		128,
		128,
		0,
		gl.RED,
		gl.UNSIGNED_BYTE,
		data,
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	// PicoCAD 2 renders faces as LÖVE meshes whose texture keeps LÖVE's
	// default "clamp" wrap mode, so UVs outside the texture repeat the edge
	// pixels instead of tiling.
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return tex;
}

/**
 * Fills the 16x6 palette LUT pixel data.
 * Row 0: regular palette colors.
 * Row 1: shade_pal_1 remapped colors (dark).
 * Row 2: shade_pal_2 remapped colors (darker).
 * Rows 3-5: the same three rows for the palette cycle's blend target.
 *
 * An optional remap substitutes the material for each palette index before
 * the shade lookup. Index c renders with remap[c]'s color AND remap[c]'s
 * shade ramp, so swapped colors keep correct shading (palette swap effect).
 *
 * `target` is the remap of the upcoming cycle step, written to rows 3-5 for
 * the dithered blend's per-pixel row-set flip. `blend` lerps rows 0-2 toward
 * the target colors for the smooth blend.
 *
 * @param texture - The parsed texture data.
 * @param remap - Optional 16-entry display remap (identity when omitted).
 * @param target - Optional blend-target remap (defaults to `remap`).
 * @param blend - Smooth blend progress toward the target, 0-1.
 * @returns The 16x6 interleaved RGB byte data.
 */
export function buildPaletteData(
	texture: TextureData,
	remap?: readonly number[],
	target?: readonly number[],
	blend = 0,
): Uint8Array {
	const data = new Uint8Array(16 * 6 * 3);
	const colorCount = texture.colors.length / 3;

	const resolve = (
		col: number,
		row: number,
		map: readonly number[] | undefined,
	): number => {
		let mapped = col;
		if (map && col < colorCount) {
			const m = map[col];
			if (Number.isInteger(m) && m >= 0 && m < colorCount) mapped = m;
		}

		if (row === 1 && mapped < colorCount) {
			return texture.shadePalette1[mapped];
		}
		if (row === 2 && mapped < colorCount) {
			return texture.shadePalette2[mapped];
		}
		return mapped;
	};

	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 16; col++) {
			const a = resolve(col, row, remap);
			const b = resolve(col, row, target ?? remap);

			const currentOffset = (row * 16 + col) * 3;
			const targetOffset = ((row + 3) * 16 + col) * 3;
			for (let ch = 0; ch < 3; ch++) {
				const ca = a < colorCount ? texture.colors[a * 3 + ch] : 0;
				const cb = b < colorCount ? texture.colors[b * 3 + ch] : 0;
				data[currentOffset + ch] = Math.round((ca + (cb - ca) * blend) * 255);
				data[targetOffset + ch] = Math.round(cb * 255);
			}
		}
	}

	return data;
}

/**
 * Uploads new pixel data into an existing palette texture.
 *
 * @param gl - The WebGL 2 rendering context.
 * @param tex - The palette texture to update.
 * @param data - The 16x6 interleaved RGB byte data.
 */
export function updatePaletteTexture(
	gl: WebGL2RenderingContext,
	tex: WebGLTexture,
	data: Uint8Array,
): void {
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texSubImage2D(
		gl.TEXTURE_2D,
		0,
		0,
		0,
		16,
		6,
		gl.RGB,
		gl.UNSIGNED_BYTE,
		data,
	);
	gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Creates the 16x6 palette texture for color lookup with shading.
 *
 * @param gl - The WebGL 2 rendering context.
 * @param texture - The parsed texture data.
 * @returns The WebGL texture object.
 */
export function createPaletteTexture(
	gl: WebGL2RenderingContext,
	texture: TextureData,
): WebGLTexture {
	const tex = gl.createTexture();
	if (!tex) throw new Error("Failed to create palette texture");

	const data = buildPaletteData(texture);

	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGB8,
		16,
		6,
		0,
		gl.RGB,
		gl.UNSIGNED_BYTE,
		data,
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return tex;
}
