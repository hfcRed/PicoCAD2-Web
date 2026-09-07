import fontDataUrl from "../assets/font.png";
import type { Color3 } from "../types/scene.ts";

interface Glyph {
	pixels: [number, number][];
	kerning: number;
}

/**
 * Character order used by the Skrovet bitmap font format.
 */
const ALPHABET = [
	..."ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz0123456789",
	..."_!\"#$%&'()*+,-./:;<=>?[]\\^_'{}|~@",
	..."ÄÁÀÂÅÃÇçäáàâåãÑñÏÍÌÎÜÚÙÛïíìîüúùû",
	..."ÖÓÒÔÕŸÝYöóòôõÿýyËÉÈÊ",
];

/** How many rendered strings a font keeps before it starts over. */
const RENDER_CACHE_LIMIT = 64;

/**
 * A bitmap font parsed from a font spritesheet.
 * Used for rendering pixel-perfect text overlays like viewport tags.
 */
export class BitmapFont {
	private readonly glyphs: Map<string, Glyph>;
	private readonly offset: number;
	private readonly height: number;
	private readonly rendered = new Map<string, ImageBitmap>();

	/**
	 * Creates a BitmapFont from pre-parsed glyph data.
	 *
	 * @param glyphs - Map of character to glyph data.
	 * @param offset - The vertical offset to apply when drawing.
	 * @param height - The glyph height in pixels.
	 */
	private constructor(
		glyphs: Map<string, Glyph>,
		offset: number,
		height: number,
	) {
		this.glyphs = glyphs;
		this.offset = offset;
		this.height = height;
	}

	/**
	 * Loads and parses a bitmap font from an image URL.
	 *
	 * @param url - The URL of the font PNG spritesheet.
	 * @returns The parsed bitmap font.
	 */
	static async load(url: string): Promise<BitmapFont> {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.src = url;

		try {
			await img.decode();
		} catch {
			throw new Error(`Failed to load font image: ${url}`);
		}

		const canvas = new OffscreenCanvas(img.width, img.height);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Failed to get 2D context");

		ctx.drawImage(img, 0, 0);
		const imageData = ctx.getImageData(0, 0, img.width, img.height);

		return BitmapFont.parse(imageData.data, img.width, img.height);
	}

	/**
	 * Loads the bundled default bitmap font.
	 *
	 * @returns The parsed bitmap font.
	 */
	static async loadDefault(): Promise<BitmapFont> {
		return BitmapFont.load(fontDataUrl);
	}

	/**
	 * Parses glyph data from raw image pixel data.
	 *
	 * @param data - The raw RGBA pixel data.
	 * @param imgW - The image width in pixels.
	 * @param imgH - The image height in pixels.
	 * @returns The parsed bitmap font.
	 */
	static parse(
		data: Uint8ClampedArray,
		imgW: number,
		imgH: number,
	): BitmapFont {
		const getPixel = (
			x: number,
			y: number,
		): [number, number, number, number] => {
			const i = (y * imgW + x) * 4;
			return [data[i], data[i + 1], data[i + 2], data[i + 3]];
		};

		const [gridR, gridG, gridB, gridA] = getPixel(0, 0);

		const isGrid = (x: number, y: number): boolean => {
			const [r, g, b, a] = getPixel(x, y);
			return r === gridR && g === gridG && b === gridB && a === gridA;
		};

		let x1 = 1;
		while (x1 < imgW && !isGrid(x1, 1)) x1++;
		const cellW = x1;

		let y1 = 1;
		while (y1 < imgH && !isGrid(1, y1)) y1++;
		const cellH = y1;

		const glyphW = cellW - 1;
		const glyphH = cellH - 1;

		const glyphs = new Map<string, Glyph>();
		let pos = 0;
		let aY = glyphH;
		let gY = 0;
		let maxW = 0;

		let px = 0;
		let py = 0;
		while (py < imgH) {
			const char = pos < ALPHABET.length ? ALPHABET[pos] : "";
			let emptyBox = true;

			if (char !== "" && !glyphs.has(char)) {
				const pixels: [number, number][] = [];
				let w = 0;

				for (let yy = 1; yy <= glyphH; yy++) {
					for (let xx = 1; xx <= glyphW; xx++) {
						const [, , , a] = getPixel(px + xx, py + yy);
						if (a > 0) {
							w = Math.max(xx, w);
							pixels.push([xx - 1, yy - 1]);

							if (char === "A") aY = Math.min(aY, yy);
							if (char === "g") gY = Math.max(gY, yy);

							emptyBox = false;
						}
					}
				}

				glyphs.set(char, { pixels, kerning: w + 1 });
				if (w > maxW) maxW = w;
			} else if (char.length > 0) {
				emptyBox = false;
			}

			if (!emptyBox || char === " ") {
				pos++;
			} else {
				glyphs.delete(char);
			}

			px += cellW;
			if (px >= imgW) {
				px = 0;
				py += cellH;
			}
		}

		const spaceGlyph = glyphs.get(" ");
		if (spaceGlyph) {
			spaceGlyph.kerning = Math.floor(maxW / 2) + 1;
		}

		const offset = aY - 1;

		return new BitmapFont(glyphs, offset, glyphH);
	}

	/**
	 * Computes the width of a text string in pixels.
	 *
	 * @param text - The text to measure.
	 * @returns The width in pixels.
	 */
	getTextWidth(text: string): number {
		let w = 0;
		for (const char of text) {
			const glyph = this.glyphs.get(char);
			if (glyph) w += glyph.kerning;
		}
		return w > 0 ? w - 1 : 0;
	}

	/**
	 * Draws text onto a 2D canvas context at the given position.
	 * The text is rendered pixel by pixel once and copied on later calls.
	 *
	 * @param ctx - The 2D canvas rendering context.
	 * @param text - The text to draw.
	 * @param x - The x position in pixels.
	 * @param y - The y position in pixels.
	 * @param color - The text color as [r, g, b] in 0-1 range.
	 * @param right - If true, text is right-aligned from x.
	 */
	drawText(
		ctx: CanvasRenderingContext2D,
		text: string,
		x: number,
		y: number,
		color: Color3,
		right?: boolean,
	): void {
		const image = this.render(text, color);
		if (!image) return;

		const width = this.getTextWidth(text);
		const sx = right ? Math.floor(x - width) : Math.floor(x);
		const sy = Math.floor(y - this.offset);
		ctx.drawImage(image, sx, sy);
	}

	/**
	 * Renders a string in a color into a bitmap of its own, one fill per
	 * glyph pixel, and keeps it so a tag drawn every frame costs one image
	 * copy instead. Unknown characters draw as "?".
	 *
	 * @param text - The text to render.
	 * @param color - The text color as [r, g, b] in 0-1 range.
	 * @returns The rendered text, or null when nothing would be drawn.
	 */
	private render(text: string, color: Color3): ImageBitmap | null {
		const rgb = `${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)}`;
		const key = `${rgb}|${text}`;
		const cached = this.rendered.get(key);
		if (cached) return cached;

		let width = 0;
		for (const char of text) {
			const glyph = this.glyphs.get(char) ?? this.glyphs.get("?");
			if (glyph) width += glyph.kerning;
		}
		if (width === 0) return null;

		const canvas = new OffscreenCanvas(width, this.height);
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		ctx.fillStyle = `rgb(${rgb})`;
		let sx = 0;
		for (const char of text) {
			const glyph = this.glyphs.get(char) ?? this.glyphs.get("?");
			if (!glyph) continue;

			for (const [px, py] of glyph.pixels) {
				ctx.fillRect(sx + px, py, 1, 1);
			}
			sx += glyph.kerning;
		}

		const image = canvas.transferToImageBitmap();
		if (this.rendered.size >= RENDER_CACHE_LIMIT) {
			for (const old of this.rendered.values()) old.close();
			this.rendered.clear();
		}
		this.rendered.set(key, image);
		return image;
	}
}
