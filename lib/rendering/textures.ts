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
 * Fills the 16x3 palette LUT pixel data.
 * Row 0: regular palette colors.
 * Row 1: shade_pal_1 remapped colors (dark).
 * Row 2: shade_pal_2 remapped colors (darker).
 *
 * An optional remap substitutes the material for each palette index before
 * the shade lookup. Index c renders with remap[c]'s color AND remap[c]'s
 * shade ramp, so swapped colors keep correct shading (palette swap effect).
 *
 * @param texture - The parsed texture data.
 * @param remap - Optional 16-entry display remap (identity when omitted).
 * @returns The 16x3 interleaved RGB byte data.
 */
export function buildPaletteData(
	texture: TextureData,
	remap?: readonly number[],
): Uint8Array {
	const data = new Uint8Array(16 * 3 * 3);
	const colorCount = texture.colors.length / 3;

	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 16; col++) {
			let mapped = col;
			if (remap && col < colorCount) {
				const m = remap[col];
				if (Number.isInteger(m) && m >= 0 && m < colorCount) mapped = m;
			}

			let sourceIndex = mapped;
			if (row === 1 && mapped < colorCount) {
				sourceIndex = texture.shadePalette1[mapped];
			} else if (row === 2 && mapped < colorCount) {
				sourceIndex = texture.shadePalette2[mapped];
			}

			const pixelOffset = (row * 16 + col) * 3;
			if (sourceIndex < colorCount) {
				data[pixelOffset] = Math.round(texture.colors[sourceIndex * 3] * 255);
				data[pixelOffset + 1] = Math.round(
					texture.colors[sourceIndex * 3 + 1] * 255,
				);
				data[pixelOffset + 2] = Math.round(
					texture.colors[sourceIndex * 3 + 2] * 255,
				);
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
 * @param data - The 16x3 interleaved RGB byte data.
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
		3,
		gl.RGB,
		gl.UNSIGNED_BYTE,
		data,
	);
	gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Creates the 16x3 palette texture for color lookup with shading.
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
		3,
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
