import { mat4, vec3 } from "gl-matrix";
import * as twgl from "twgl.js";
import type { OrbitCamera } from "../camera/orbit-camera.ts";
import { traverseNode, updateNodeMatrix } from "../scene/scene-graph.ts";
import type { Color3, PicoCAD2Model } from "../types/scene.ts";
import { buildAllBuffers, type NodeBuffers } from "./buffers.ts";
import { createPrograms, type ShaderPrograms } from "./programs.ts";
import { createIndexTexture, createPaletteTexture } from "./textures.ts";

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

export interface RenderSettings {
	shading: boolean;
	/** Numeric render mode: 0 = textured, 1 = flat color, 2 = none (wireframe only). */
	renderMode: number;
	wireframe: boolean;
	wireframeColor: Color3;
	outlineSize: number;
	outlineColor: Color3;
}

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
	private fbo: WebGLFramebuffer | null = null;
	private fboTexture: WebGLTexture | null = null;
	private fboDepth: WebGLRenderbuffer | null = null;
	private fboWidth = 0;
	private fboHeight = 0;
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
	 */
	draw(
		camera: OrbitCamera,
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const gl = this.gl;
		const w = gl.canvas.width;
		const h = gl.canvas.height;
		const useOutline = settings.outlineSize > 0;

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

		// Update node matrices
		traverseNode(
			model.root,
			(node) => {
				if (node.mesh) {
					updateNodeMatrix(node);
				}
			},
			(node) => node.visible,
		);

		const bgIdx = model.texture.backgroundColor;
		const colors = model.texture.colors;
		const bgR = colors[bgIdx * 3] ?? 0;
		const bgG = colors[bgIdx * 3 + 1] ?? 0;
		const bgB = colors[bgIdx * 3 + 2] ?? 0;

		if (useOutline) {
			this.ensureFbo(w, h);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
			gl.clearColor(0, 0, 0, 0);
		} else {
			gl.clearColor(bgR, bgG, bgB, 1);
		}

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.viewport(0, 0, w, h);

		if (settings.renderMode < 2) {
			this.drawModel(vpMatrix, settings, model, resources);
		}

		if (settings.wireframe) {
			this.drawWireframe(vpMatrix, settings.wireframeColor, resources);
		}

		if (useOutline) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			this.drawOutline(w, h, settings, bgR, bgG, bgB);
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
		gl.deleteProgram(this.programs.wireframe.program);
		gl.deleteProgram(this.programs.outline.program);
		this.disposeFbo();
		if (this.emptyVao) {
			gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}
	}

	/**
	 * Ensures the framebuffer object exists and matches the given dimensions.
	 *
	 * @param w - The required width in pixels.
	 * @param h - The required height in pixels.
	 */
	private ensureFbo(w: number, h: number): void {
		if (this.fbo && this.fboWidth === w && this.fboHeight === h) return;

		const gl = this.gl;
		this.disposeFbo();

		this.fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

		this.fboTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.fboTexture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			w,
			h,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			this.fboTexture,
			0,
		);

		this.fboDepth = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.fboDepth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.RENDERBUFFER,
			this.fboDepth,
		);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.fboWidth = w;
		this.fboHeight = h;
	}

	/**
	 * Frees the framebuffer resources.
	 */
	private disposeFbo(): void {
		const gl = this.gl;

		if (this.fbo) {
			gl.deleteFramebuffer(this.fbo);
			this.fbo = null;
		}
		if (this.fboTexture) {
			gl.deleteTexture(this.fboTexture);
			this.fboTexture = null;
		}
		if (this.fboDepth) {
			gl.deleteRenderbuffer(this.fboDepth);
			this.fboDepth = null;
		}

		this.fboWidth = 0;
		this.fboHeight = 0;
	}

	/**
	 * Applies the outline post-process shader.
	 * Reads the FBO color texture and draws a fullscreen triangle to the default framebuffer.
	 *
	 * @param w - The render width in pixels.
	 * @param h - The render height in pixels.
	 * @param settings - The render settings containing outline parameters.
	 * @param bgR - Background red component (0-1).
	 * @param bgG - Background green component (0-1).
	 * @param bgB - Background blue component (0-1).
	 */
	private drawOutline(
		w: number,
		h: number,
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
			u_texture: this.fboTexture,
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

	/**
	 * Draws wireframe edges for all visible mesh nodes.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param color - The wireframe color as [r, g, b].
	 * @param resources - The GPU resources.
	 */
	private drawWireframe(
		vpMatrix: mat4,
		color: Color3,
		resources: ModelResources,
	): void {
		const gl = this.gl;

		gl.useProgram(this.programs.wireframe.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.disable(gl.CULL_FACE);

		for (const nb of resources.nodeBuffers) {
			if (!nb.node.visible || !nb.wireframe) continue;

			mat4.multiply(this.mvpMatrix, vpMatrix, nb.node.localMatrix);

			const uniforms = {
				u_mvp: this.mvpMatrix,
				u_color: color,
			};

			twgl.setBuffersAndAttributes(gl, this.programs.wireframe, nb.wireframe);
			twgl.setUniforms(this.programs.wireframe, uniforms);
			twgl.drawBufferInfo(gl, nb.wireframe, gl.LINES);

			this.stats.drawCalls++;
		}

		gl.disable(gl.DEPTH_TEST);
	}

}
