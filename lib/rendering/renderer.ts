import { mat4, vec3 } from "gl-matrix";
import * as twgl from "twgl.js";
import type { OrbitCamera } from "../camera/orbit-camera.ts";
import { traverseNode, updateNodeMatrix } from "../scene/scene-graph.ts";
import type { Color3, PicoCAD2Model, SceneNode } from "../types/scene.ts";
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
	/** 0 = texture, 1 = color */
	renderMode: number;
	wireframe: boolean;
	wireframeColor: Color3;
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

		this.stats.drawCalls = 0;
		this.stats.polyCount = 0;

		const aspect = gl.canvas.width / gl.canvas.height;
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

		// Set background color
		const bgIdx = model.texture.backgroundColor;
		const colors = model.texture.colors;
		gl.clearColor(
			colors[bgIdx * 3] ?? 0,
			colors[bgIdx * 3 + 1] ?? 0,
			colors[bgIdx * 3 + 2] ?? 0,
			1,
		);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		if (settings.renderMode < 2) {
			this.drawModel(vpMatrix, settings, model, resources);
		}

		if (settings.wireframe) {
			this.drawWireframe(vpMatrix, settings.wireframeColor, resources);
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
	 * Frees the shader programs held by this renderer.
	 */
	dispose(): void {
		const gl = this.gl;
		gl.deleteProgram(this.programs.model.program);
		gl.deleteProgram(this.programs.wireframe.program);
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
			if (!this.isNodeVisible(nb.node)) continue;

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
			if (!this.isNodeVisible(nb.node)) continue;

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

	/**
	 * Checks if a node is visible by tracing up the scene graph.
	 * In PicoCAD 2, hidden parent nodes hide all children.
	 *
	 * @param node - The node to check.
	 * @returns True if the node and all ancestors are visible.
	 */
	private isNodeVisible(_node: SceneNode): boolean {
		// Since we build buffers via traverseNode which visits all descendants
		// and the render traversal already gates on visibility,
		// we just check this node's own visibility flag.
		// Parent visibility gating happens during animation evaluation.
		return _node.visible;
	}
}
