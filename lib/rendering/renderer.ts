import { mat4, vec3 } from "gl-matrix";
import * as twgl from "twgl.js";
import type { OrbitCamera } from "../camera/orbit-camera.ts";
import { traverseNode, updateNodeMatrix } from "../scene/scene-graph.ts";
import type { Color3, PicoCAD2Model } from "../types/scene.ts";
import { buildAllBuffers, type NodeBuffers } from "./buffers.ts";
import { GradientOutlineEffect } from "./effects/gradient-outline-effect.ts";
import type { PostProcessPipeline } from "./effects/pipeline.ts";
import { createPrograms, type ShaderPrograms } from "./programs.ts";
import { createIndexTexture, createPaletteTexture } from "./textures.ts";

export interface RenderSettings {
	shading: boolean;
	renderMode: number;
	outlineSize: number;
	outlineColor: Color3;
	backgroundColor: Color3 | null;
}

/**
 * Light direction in view space, matching PicoCAD 2's {0, -0.3, 1}.
 * Z is negated because gl-matrix's lookAt has z pointing away from the scene,
 * while PicoCAD 2's lookAt has z pointing into the scene.
 */
const LIGHT_DIR_VIEW = vec3.normalize(
	vec3.create(),
	vec3.fromValues(0, -0.3, -1),
);

/** Ambient light level matching PicoCAD 2. */
const AMBIENT = 0.15;

export interface ModelResources {
	indexTexture: WebGLTexture;
	paletteTexture: WebGLTexture;
	nodeBuffers: NodeBuffers[];
}

export interface RenderStats {
	drawCalls: number;
	polyCount: number;
}

/** The main WebGL renderer for PicoCAD 2 models. */
export class Renderer {
	readonly gl: WebGL2RenderingContext;
	readonly stats: RenderStats = { drawCalls: 0, polyCount: 0 };
	private readonly mvpMatrix: mat4 = mat4.create();
	private readonly lightDirWorld: vec3 = vec3.create();
	private programs: ShaderPrograms;
	private emptyVao: WebGLVertexArrayObject | null = null;

	/**
	 * Creates a new renderer for the given WebGL 2 context.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.programs = createPrograms(gl);
	}

	/**
	 * Creates GPU resources for a parsed model.
	 *
	 * @param model - The parsed PicoCAD 2 model.
	 * @returns The GPU resources needed to render this model.
	 */
	createModelResources(model: PicoCAD2Model): ModelResources {
		return {
			indexTexture: createIndexTexture(this.gl, model.texture),
			paletteTexture: createPaletteTexture(this.gl, model.texture),
			nodeBuffers: buildAllBuffers(this.gl, model.root),
		};
	}

	/**
	 * Renders a single frame of the given model.
	 *
	 * @param camera - The orbit camera providing view/projection matrices.
	 * @param settings - The current render settings.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources for this model.
	 * @param time - Elapsed time in seconds for animated effects.
	 * @param pipeline - The per-viewer post-process pipeline.
	 */
	draw(
		camera: OrbitCamera,
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
		time: number,
		pipeline: PostProcessPipeline,
	): void {
		const gl = this.gl;
		const w = gl.canvas.width;
		const h = gl.canvas.height;

		const gradOutline = pipeline.getPostEffect("gradientOutline");
		const useGradientOutline =
			gradOutline instanceof GradientOutlineEffect && gradOutline.enabled;
		const useOutline = settings.outlineSize > 0 && !useGradientOutline;
		const hasEffects = pipeline.hasActiveEffects();
		const useFbo = useOutline || hasEffects;

		this.stats.drawCalls = 0;
		this.stats.polyCount = 0;

		const aspect = w / h;
		const vpMatrix = camera.getViewProjectionMatrix(aspect);

		// Compute world-space light direction from camera orientation.
		// The light is attached to the camera in PicoCAD 2 (view-space direction).
		// Transform from view space to world space using transpose of mat3(viewMatrix).
		const v = camera.getViewMatrix();
		const lx = LIGHT_DIR_VIEW[0];
		const ly = LIGHT_DIR_VIEW[1];
		const lz = LIGHT_DIR_VIEW[2];
		this.lightDirWorld[0] = v[0] * lx + v[1] * ly + v[2] * lz;
		this.lightDirWorld[1] = v[4] * lx + v[5] * ly + v[6] * lz;
		this.lightDirWorld[2] = v[8] * lx + v[9] * ly + v[10] * lz;

		traverseNode(
			model.root,
			(node) => {
				if (node.mesh) {
					updateNodeMatrix(node);
				}
			},
			(node) => node.visible,
		);

		let bgR: number;
		let bgG: number;
		let bgB: number;
		if (settings.backgroundColor) {
			[bgR, bgG, bgB] = settings.backgroundColor;
		} else {
			const bgIdx = model.texture.backgroundColor;
			const colors = model.texture.colors;
			bgR = colors[bgIdx * 3] ?? 0;
			bgG = colors[bgIdx * 3 + 1] ?? 0;
			bgB = colors[bgIdx * 3 + 2] ?? 0;
		}

		if (useGradientOutline) {
			(gradOutline as GradientOutlineEffect).backgroundColor = [bgR, bgG, bgB];
		}

		if (useFbo) {
			pipeline.pool.ensure(gl, w, h);
			pipeline.pool.bindScene(gl);

			if (useOutline || useGradientOutline) {
				gl.clearColor(0, 0, 0, 0);
			} else {
				gl.clearColor(bgR, bgG, bgB, 0);
			}
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.clearColor(bgR, bgG, bgB, 1);
		}

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.viewport(0, 0, w, h);

		if (settings.renderMode < 2) {
			this.drawModel(vpMatrix, settings, model, resources);
		}

		if (pipeline.hasActiveSceneEffects()) {
			const ctx = {
				gl,
				width: w,
				height: h,
				time,
				depthTexture: pipeline.pool.getDepthTexture(),
			};
			for (const effect of pipeline.sceneEffects) {
				if (!effect.enabled) continue;
				if (!effect.initialized) {
					effect.init(gl);
				}
				effect.render(ctx, vpMatrix, resources);
			}
		}

		if (!useFbo) return;

		if (useOutline) {
			const inputTexture = pipeline.pool.swap(gl);
			gl.viewport(0, 0, w, h);
			this.drawOutline(w, h, inputTexture, settings, bgR, bgG, bgB);
		}

		if (pipeline.hasActivePostEffects()) {
			pipeline.pool.detachDepth(gl);
			const ctx = {
				gl,
				width: w,
				height: h,
				time,
				depthTexture: pipeline.pool.getDepthTexture(),
			};
			pipeline.execute(ctx, [bgR, bgG, bgB]);
		} else {
			pipeline.blit(gl, w, h, [bgR, bgG, bgB]);
		}
	}

	/**
	 * Frees GPU resources for a specific model.
	 *
	 * @param resources - The model resources to dispose.
	 */
	disposeModelResources(resources: ModelResources): void {
		const gl = this.gl;
		gl.deleteTexture(resources.indexTexture);
		gl.deleteTexture(resources.paletteTexture);
		resources.nodeBuffers = [];
	}

	/**
	 * Frees all GPU resources held by this renderer.
	 */
	dispose(): void {
		const gl = this.gl;
		gl.deleteProgram(this.programs.model.program);
		gl.deleteProgram(this.programs.outline.program);

		if (this.emptyVao) {
			gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}
	}

	/**
	 * Applies the outline post-process shader.
	 * Reads the input texture and draws to the currently bound framebuffer.
	 *
	 * @param w - The render width in pixels.
	 * @param h - The render height in pixels.
	 * @param inputTexture - The scene texture to detect outlines from.
	 * @param settings - The render settings containing outline parameters.
	 * @param bgR - Background red component (0-1).
	 * @param bgG - Background green component (0-1).
	 * @param bgB - Background blue component (0-1).
	 */
	private drawOutline(
		w: number,
		h: number,
		inputTexture: WebGLTexture,
		settings: RenderSettings,
		bgR: number,
		bgG: number,
		bgB: number,
	): void {
		const gl = this.gl;

		if (!this.emptyVao) {
			this.emptyVao = gl.createVertexArray();
		}

		gl.viewport(0, 0, w, h);
		gl.disable(gl.DEPTH_TEST);

		gl.useProgram(this.programs.outline.program);

		twgl.setUniforms(this.programs.outline, {
			u_texture: inputTexture,
			u_outlineSize: settings.outlineSize,
			u_outlineColor: settings.outlineColor,
			u_texelSize: [1 / w, 1 / h],
			u_backgroundColor: [bgR, bgG, bgB],
		});

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}

	/**
	 * Draws the model with the textured/colored shader.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param settings - The current render settings.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources.
	 */
	private drawModel(
		vpMatrix: mat4,
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const gl = this.gl;

		gl.useProgram(this.programs.model.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);

		// Draw priority faces
		this.drawGroups(vpMatrix, settings, [2, 3], model, resources);

		// Clear depth buffer
		gl.clear(gl.DEPTH_BUFFER_BIT);

		// Draw non-priority faces
		this.drawGroups(vpMatrix, settings, [0, 1], model, resources);

		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
	}

	/**
	 * Draws specific render groups across all node buffers.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param settings - The current render settings.
	 * @param groupIndices - Which render groups to draw.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources.
	 */
	private drawGroups(
		vpMatrix: mat4,
		settings: RenderSettings,
		groupIndices: number[],
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const gl = this.gl;

		for (const nb of resources.nodeBuffers) {
			if (!nb.node.visible) continue;

			mat4.multiply(this.mvpMatrix, vpMatrix, nb.node.localMatrix);

			for (const groupIdx of groupIndices) {
				const group = nb.groups[groupIdx];
				if (!group) continue;

				const isDoubleSided = (groupIdx & 1) !== 0;
				if (isDoubleSided) {
					gl.disable(gl.CULL_FACE);
				} else {
					gl.enable(gl.CULL_FACE);
					gl.cullFace(gl.FRONT);
				}

				const uniforms = {
					u_mvp: this.mvpMatrix,
					u_worldMatrix: nb.node.localMatrix,
					u_indexTexture: resources.indexTexture,
					u_paletteTexture: resources.paletteTexture,
					u_lightDir: this.lightDirWorld,
					u_ambient: AMBIENT,
					u_transparentColor: model.texture.transparentColor,
					u_shadingEnabled: settings.shading,
					u_renderMode: settings.renderMode,
				};

				twgl.setBuffersAndAttributes(gl, this.programs.model, group.bufferInfo);
				twgl.setUniforms(this.programs.model, uniforms);
				twgl.drawBufferInfo(gl, group.bufferInfo);

				this.stats.drawCalls++;
				this.stats.polyCount += (group.bufferInfo.numElements ?? 0) / 3;
			}
		}
	}
}
