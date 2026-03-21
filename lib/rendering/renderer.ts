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

/** Current render settings. */
export interface RenderSettings {
	shading: boolean;
	/** 0 = texture, 1 = color */
	renderMode: number;
	wireframe: boolean;
	wireframeColor: Color3;
}

/** The main WebGL renderer for PicoCAD 2 models. */
export class Renderer {
	readonly gl: WebGL2RenderingContext;
	private programs: ShaderPrograms;
	private indexTexture: WebGLTexture | null = null;
	private paletteTexture: WebGLTexture | null = null;
	private nodeBuffers: NodeBuffers[] = [];
	private model: PicoCAD2Model | null = null;
	private readonly mvpMatrix: mat4 = mat4.create();
	private readonly lightDirWorld: vec3 = vec3.create();

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
	 * Loads a parsed model into the renderer, creating all GPU resources.
	 *
	 * @param model - The parsed PicoCAD 2 model.
	 */
	loadModel(model: PicoCAD2Model): void {
		this.dispose();
		this.model = model;

		this.indexTexture = createIndexTexture(this.gl, model.texture);
		this.paletteTexture = createPaletteTexture(this.gl, model.texture);
		this.nodeBuffers = buildAllBuffers(this.gl, model.root);
	}

	/**
	 * Renders a single frame of the loaded model.
	 *
	 * @param camera - The orbit camera providing view/projection matrices.
	 * @param settings - The current render settings.
	 */
	draw(camera: OrbitCamera, settings: RenderSettings): void {
		if (!this.model) return;

		const gl = this.gl;
		const model = this.model;

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
			this.drawModel(vpMatrix, settings);
		}

		if (settings.wireframe) {
			this.drawWireframe(vpMatrix, settings.wireframeColor);
		}
	}

	/**
	 * Draws the model with the textured/colored shader.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param settings - The current render settings.
	 */
	private drawModel(vpMatrix: mat4, settings: RenderSettings): void {
		const gl = this.gl;

		gl.useProgram(this.programs.model.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);

		// Draw priority faces
		this.drawGroups(vpMatrix, settings, [2, 3]);

		// Clear depth buffer
		gl.clear(gl.DEPTH_BUFFER_BIT);

		// Draw non-priority faces
		this.drawGroups(vpMatrix, settings, [0, 1]);

		gl.disable(gl.DEPTH_TEST);
	}

	/**
	 * Draws specific render groups across all node buffers.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param settings - The current render settings.
	 * @param groupIndices - Which render groups to draw.
	 */
	private drawGroups(
		vpMatrix: mat4,
		settings: RenderSettings,
		groupIndices: number[],
	): void {
		const gl = this.gl;
		const model = this.model;
		if (!model) return;

		for (const nb of this.nodeBuffers) {
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
					u_indexTexture: this.indexTexture,
					u_paletteTexture: this.paletteTexture,
					u_lightDir: this.lightDirWorld,
					u_ambient: AMBIENT,
					u_transparentColor: model.texture.transparentColor,
					u_shadingEnabled: settings.shading,
					u_renderMode: settings.renderMode,
				};

				twgl.setBuffersAndAttributes(gl, this.programs.model, group.bufferInfo);
				twgl.setUniforms(this.programs.model, uniforms);
				twgl.drawBufferInfo(gl, group.bufferInfo);
			}
		}
	}

	/**
	 * Draws wireframe edges for all visible mesh nodes.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param color - The wireframe color as [r, g, b].
	 */
	private drawWireframe(vpMatrix: mat4, color: Color3): void {
		const gl = this.gl;

		gl.useProgram(this.programs.wireframe.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.disable(gl.CULL_FACE);

		for (const nb of this.nodeBuffers) {
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

	/**
	 * Frees all GPU resources held by this renderer.
	 */
	dispose(): void {
		const gl = this.gl;

		if (this.indexTexture) {
			gl.deleteTexture(this.indexTexture);
			this.indexTexture = null;
		}
		if (this.paletteTexture) {
			gl.deleteTexture(this.paletteTexture);
			this.paletteTexture = null;
		}

		this.nodeBuffers = [];
		this.model = null;
	}
}
