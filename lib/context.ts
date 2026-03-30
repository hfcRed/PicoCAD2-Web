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

/**
 * A shared WebGL rendering context that multiple PicoCAD2Viewer instances can use.
 * This allows rendering to multiple canvases while only using a single WebGL context,
 * avoiding the browsers 16 active WebGL context limit.
 */
export class PicoCAD2Context {
	readonly canvas: OffscreenCanvas;
	readonly gl: WebGL2RenderingContext;
	private renderer: Renderer;
	font: BitmapFont | null = null;

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

		const gl = this.canvas.getContext("webgl2", {
			antialias: false,
			alpha: true,
			premultipliedAlpha: false,
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

		this.renderer.draw(camera, settings, model, resources, time, pipeline);
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
		this.renderer.dispose();
	}
}
