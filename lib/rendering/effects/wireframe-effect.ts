import { mat4 } from "gl-matrix";
import * as twgl from "twgl.js";
import wireframeFrag from "../../shaders/wireframe.frag";
import wireframeVert from "../../shaders/wireframe.vert";
import type { WireframeOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import type { ModelResources } from "../renderer.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { writeMeshDeformUniforms } from "./mesh-deform-effect.ts";
import type { EffectContext, SceneEffect } from "./types.ts";

/**
 * Renders wireframe edges over the model as GL_LINES.
 * This is a scene effect (geometry-based), not a post-process effect.
 * Follows the mesh deform through the shared shader chunk, and hides
 * itself while a triangle shatter is in progress.
 */
export class WireframeEffect implements SceneEffect {
	readonly id = "wireframe";
	initialized = false;

	private program: twgl.ProgramInfo | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private readonly uniforms = {
		u_vp: mat4.create() as mat4,
		u_worldMatrix: mat4.create() as mat4,
		u_color: [1, 1, 1] as Color3,

		u_deformEnabled: false,
		u_deformBarrel: 0,
		u_deformBarrelAxis: 1,
		u_deformSpherify: 0,
		u_deformTwist: 0,
		u_deformTwistAxis: 1,
		u_deformTwistPhase: 0,
		u_deformCenter: [0, 0, 0] as Color3,
		u_deformHalfExt: [1, 1, 1] as Color3,
	};

	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, WIREFRAME_DEFAULTS);
	}

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
		if (ctx.shatterActive) return;

		const gl = ctx.gl;

		gl.useProgram(this.program!.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.disable(gl.CULL_FACE);

		const uniforms = this.uniforms;
		mat4.copy(uniforms.u_vp, vpMatrix);
		uniforms.u_color = this.color;
		writeMeshDeformUniforms(
			uniforms,
			ctx.meshDeform,
			resources.bounds,
			ctx.time,
		);

		for (const nb of resources.nodeBuffers) {
			if (!nb.node.renderVisible || nb.node.ghost || !nb.wireframe) continue;

			uniforms.u_worldMatrix = nb.node.worldMatrix;

			twgl.setBuffersAndAttributes(gl, this.program!, nb.wireframe);
			twgl.setUniforms(this.program!, uniforms);
			twgl.drawBufferInfo(gl, nb.wireframe, gl.LINES);

			ctx.stats.drawCalls++;
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

export interface WireframeEffect extends Required<WireframeOptions> {}

/** Default settings for {@link WireframeEffect}. */
export const WIREFRAME_DEFAULTS = deepFreeze<DeepRequired<WireframeOptions>>({
	enabled: false,
	color: [1, 1, 1],
});
