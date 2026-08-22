import type { OrbitCamera } from "./camera/orbit-camera.ts";
import type { PostProcessPipeline } from "./rendering/effects/pipeline.ts";
import { BitmapFont } from "./rendering/font.ts";
import {
	type ModelResources,
	Renderer,
	type RenderSettings,
	type RenderStats,
} from "./rendering/renderer.ts";
import type { PicoCAD2Model } from "./types/scene.ts";
import type { PicoCAD2Viewer } from "./viewer.ts";

/** A viewer's assigned region in the shared atlas, in image space (top-left origin). */
interface ViewerSlot {
	viewer: PicoCAD2Viewer;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * A shared WebGL rendering context that multiple PicoCAD2Viewer instances can use.
 * This allows rendering to multiple canvases while only using a single WebGL context,
 * avoiding the browsers 16 active WebGL context limit.
 *
 * Viewers with a running render loop are driven by a single shared
 * requestAnimationFrame loop: each frame all due viewers render into one
 * atlas on the offscreen canvas, which is captured with a single
 * `transferToImageBitmap()` and distributed to the viewers' canvases.
 * Capturing the drawing buffer is expensive (especially on Firefox), so one
 * capture per frame scales to many viewers where one per viewer does not.
 */
export class PicoCAD2Context {
	readonly canvas: OffscreenCanvas;
	readonly gl: WebGL2RenderingContext;
	private renderer: Renderer;
	font: BitmapFont | null = null;

	private readonly slots: ViewerSlot[] = [];
	private readonly dueSlots: ViewerSlot[] = [];
	private readonly renderedSlots: ViewerSlot[] = [];
	private layoutDirty = false;
	private atlasWidth = 0;
	private atlasHeight = 0;
	private frameId: number | null = null;

	/**
	 * Rendering statistics from the most recent draw call.
	 *
	 * @returns The stats from the last render.
	 */
	get stats(): RenderStats {
		return this.renderer.stats;
	}

	/**
	 * Creates a new shared rendering context with an offscreen canvas.
	 */
	constructor() {
		this.canvas = new OffscreenCanvas(1, 1);

		// The drawing buffer holds premultiplied alpha: the renderer clears to
		// premultiplied black when transparent and the blit outputs premultiplied
		// colors. Declaring it avoids browsers multiplying by alpha a second time
		// when fractional coverage (e.g. bloom halos) reaches the canvas.
		const gl = this.canvas.getContext("webgl2", {
			antialias: false,
			alpha: true,
			premultipliedAlpha: true,
		});
		if (!gl) throw new Error("WebGL 2 is not supported");
		this.gl = gl;

		this.renderer = new Renderer(gl);

		BitmapFont.loadDefault()
			.then((font) => {
				this.font = font;
			})
			.catch((err) => {
				console.warn("Failed to load bitmap font:", err);
			});
	}

	/**
	 * Creates GPU resources for a parsed model on this context.
	 *
	 * @param model - The parsed PicoCAD 2 model.
	 * @returns The GPU resources needed to render this model.
	 */
	createModelResources(model: PicoCAD2Model): ModelResources {
		return this.renderer.createModelResources(model);
	}

	/**
	 * Renders a model to the offscreen canvas at the given resolution.
	 *
	 * @param camera - The orbit camera providing view/projection matrices.
	 * @param settings - The current render settings.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources for this model.
	 * @param width - The render width in pixels.
	 * @param height - The render height in pixels.
	 * @param time - Elapsed time in seconds for animated effects.
	 * @param pipeline - The per-viewer post-process pipeline.
	 */
	render(
		camera: OrbitCamera,
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
		width: number,
		height: number,
		time: number,
		pipeline: PostProcessPipeline,
	): void {
		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
		}

		this.renderer.draw(
			camera,
			settings,
			model,
			resources,
			time,
			pipeline,
			0,
			0,
			width,
			height,
		);
	}

	/**
	 * Renders a model into a region of the current atlas without resizing
	 * the canvas. Used by the shared render loop.
	 *
	 * @internal
	 */
	_renderAt(
		camera: OrbitCamera,
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
		x: number,
		y: number,
		width: number,
		height: number,
		time: number,
		pipeline: PostProcessPipeline,
	): void {
		this.renderer.draw(
			camera,
			settings,
			model,
			resources,
			time,
			pipeline,
			x,
			y,
			width,
			height,
		);
	}

	/**
	 * Adds a viewer to the shared render loop, starting it if necessary.
	 *
	 * @internal
	 */
	_register(viewer: PicoCAD2Viewer): void {
		if (this.slots.some((slot) => slot.viewer === viewer)) return;

		this.slots.push({ viewer, x: 0, y: 0, width: 0, height: 0 });
		this.layoutDirty = true;

		if (this.frameId === null) {
			this.frameId = requestAnimationFrame(this.frame);
		}
	}

	/**
	 * Removes a viewer from the shared render loop, stopping it when no
	 * viewers remain.
	 *
	 * @internal
	 */
	_unregister(viewer: PicoCAD2Viewer): void {
		const idx = this.slots.findIndex((slot) => slot.viewer === viewer);
		if (idx < 0) return;

		this.slots.splice(idx, 1);
		this.layoutDirty = true;

		if (this.slots.length === 0 && this.frameId !== null) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
	}

	/**
	 * The shared render loop. Renders all due viewers into the atlas, then
	 * captures the drawing buffer once and presents each viewer's region.
	 */
	private readonly frame = (now: number): void => {
		this.frameId = requestAnimationFrame(this.frame);

		const due = this.dueSlots;
		due.length = 0;
		for (const slot of this.slots) {
			if (slot.viewer._tick(now)) due.push(slot);
		}
		if (due.length === 0) return;

		this.ensureLayout();

		const rendered = this.renderedSlots;
		rendered.length = 0;
		for (const slot of due) {
			// Convert the slot's top-left image position to GL's bottom-left origin.
			const glY = this.atlasHeight - slot.y - slot.height;
			if (slot.viewer._renderToAtlas(slot.x, glY)) {
				rendered.push(slot);
			}
		}

		if (rendered.length > 0) {
			const bitmap = this.canvas.transferToImageBitmap();
			for (const slot of rendered) {
				slot.viewer._presentFromAtlas(bitmap, slot.x, slot.y);
			}
			bitmap.close();
		}

		for (const slot of due) {
			slot.viewer._emitFrame();
		}
	};

	/**
	 * Ensures the atlas layout matches the registered viewers' resolutions
	 * and the canvas matches the atlas size. Repacks only when a viewer was
	 * added or removed or a resolution changed; otherwise just restores the
	 * canvas size if a manual `draw()` call resized it.
	 */
	private ensureLayout(): void {
		if (!this.layoutDirty) {
			for (const slot of this.slots) {
				if (
					slot.width !== slot.viewer._renderWidth ||
					slot.height !== slot.viewer._renderHeight
				) {
					this.layoutDirty = true;
					break;
				}
			}
		}

		if (this.layoutDirty) {
			this.packLayout();
			this.layoutDirty = false;
		}

		if (this.canvas.width !== this.atlasWidth) {
			this.canvas.width = this.atlasWidth;
		}
		if (this.canvas.height !== this.atlasHeight) {
			this.canvas.height = this.atlasHeight;
		}
	}

	/**
	 * Shelf-packs all registered viewers into an atlas that is roughly
	 * square, so it stays well below the driver's canvas size limits.
	 */
	private packLayout(): void {
		let totalArea = 0;
		let widest = 1;
		for (const slot of this.slots) {
			slot.width = slot.viewer._renderWidth;
			slot.height = slot.viewer._renderHeight;
			totalArea += slot.width * slot.height;
			widest = Math.max(widest, slot.width);
		}

		// Sorting by height keeps shelf rows dense when resolutions differ.
		this.slots.sort((a, b) => b.height - a.height);

		const maxSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
		const targetWidth = Math.min(
			maxSize,
			Math.max(widest, Math.ceil(Math.sqrt(totalArea))),
		);

		let x = 0;
		let y = 0;
		let rowHeight = 0;
		let atlasWidth = 1;
		for (const slot of this.slots) {
			if (x > 0 && x + slot.width > targetWidth) {
				x = 0;
				y += rowHeight;
				rowHeight = 0;
			}
			slot.x = x;
			slot.y = y;
			x += slot.width;
			rowHeight = Math.max(rowHeight, slot.height);
			atlasWidth = Math.max(atlasWidth, x);
		}

		this.atlasWidth = atlasWidth;
		this.atlasHeight = Math.max(1, y + rowHeight);

		if (this.atlasHeight > maxSize) {
			console.warn(
				`PicoCAD2Context: atlas height ${this.atlasHeight} exceeds the maximum texture size ${maxSize}; viewers may render incorrectly. Reduce viewer count or resolutions.`,
			);
		}
	}

	/**
	 * Frees GPU resources for a specific model.
	 *
	 * @param resources - The model resources to dispose.
	 */
	disposeModelResources(resources: ModelResources): void {
		this.renderer.disposeModelResources(resources);
	}

	/**
	 * Frees all resources held by this context.
	 */
	dispose(): void {
		if (this.frameId !== null) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
		this.slots.length = 0;
		this.renderer.dispose();
	}
}
