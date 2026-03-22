import { mat4 } from "gl-matrix";
import * as twgl from "twgl.js";
import wireframeFrag from "../../shaders/wireframe.frag";
import wireframeVert from "../../shaders/wireframe.vert";
import type { Color3 } from "../../types/scene.ts";
import type { ModelResources } from "../renderer.ts";
import type { EffectContext, SceneEffect } from "./types.ts";

/**
 * Renders wireframe edges over the model as GL_LINES.
 * This is a scene effect (geometry-based), not a post-process effect.
 */
export class WireframeEffect implements SceneEffect {
	readonly id = "wireframe";
	enabled = false;
	initialized = false;
	color: Color3 = [1, 1, 1];

	private program: twgl.ProgramInfo | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private readonly mvpMatrix: mat4 = mat4.create();

	/**
	 * Compiles the wireframe shader program.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.program = twgl.createProgramInfo(gl, [wireframeVert, wireframeFrag]);
		this.initialized = true;
	}

	/**
	 * Draws wireframe edges for all visible mesh nodes.
	 *
	 * @param ctx - The rendering context info.
	 * @param vpMatrix - The view-projection matrix.
	 * @param resources - The GPU resources for the current model.
	 */
	render(ctx: EffectContext, vpMatrix: mat4, resources: ModelResources): void {
		const gl = ctx.gl;

		gl.useProgram(this.program!.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.disable(gl.CULL_FACE);

		for (const nb of resources.nodeBuffers) {
			if (!nb.node.visible || !nb.wireframe) continue;

			mat4.multiply(this.mvpMatrix, vpMatrix, nb.node.localMatrix);

			const uniforms = {
				u_mvp: this.mvpMatrix,
				u_color: this.color,
			};

			twgl.setBuffersAndAttributes(gl, this.program!, nb.wireframe);
			twgl.setUniforms(this.program!, uniforms);
			twgl.drawBufferInfo(gl, nb.wireframe, gl.LINES);
		}

		gl.disable(gl.DEPTH_TEST);
	}

	/**
	 * Frees the shader program.
	 */
	dispose(): void {
		if (!this.gl) return;

		if (this.program) {
			this.gl.deleteProgram(this.program.program);
			this.program = null;
		}

		this.initialized = false;
		this.gl = null;
	}
}
