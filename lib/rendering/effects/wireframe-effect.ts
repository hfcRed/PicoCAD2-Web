import { mat4 } from "gl-matrix";
import * as twgl from "twgl.js";
import wireframeFrag from "../../shaders/wireframe.frag";
import wireframeVert from "../../shaders/wireframe.vert";
import type { WireframeOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import { MODEL_ATTRIB_LOCATIONS } from "../buffers.ts";
import { compilerFor, ProgramVariants } from "../program-cache.ts";
import { MODEL_FEATURE_NAMES, WIREFRAME_FEATURES } from "../programs.ts";
import type { ModelResources } from "../renderer.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import {
	createMeshDeformUniforms,
	writeMeshDeformUniforms,
} from "./mesh-deform-effect.ts";
import type { EffectContext, SceneEffect } from "./types.ts";
import {
	createVertexGlitchUniforms,
	writeVertexGlitchUniforms,
} from "./vertex-glitch-effect.ts";

/**
 * Renders wireframe edges over the model as GL_LINES.
 * This is a scene effect (geometry-based), not a post-process effect.
 * Follows the mesh deform and the vertex glitch through the shared shader
 * chunks, in program variants keyed like the model's, and hides itself
 * while a triangle shatter is in progress.
 */
export class WireframeEffect implements SceneEffect {
	readonly id = "wireframe";
	initialized = false;

	private programs: ProgramVariants | null = null;
	private lastKey = 0;
	private gl: WebGL2RenderingContext | null = null;
	private readonly uniforms = {
		u_vp: mat4.create() as mat4,
		u_worldMatrix: mat4.create() as mat4,
		u_color: [1, 1, 1] as Color3,
		u_voxelSide: -1,
		u_nodeBits: 0,
		u_time: 0,
		...createMeshDeformUniforms(),
		...createVertexGlitchUniforms(),
	};

	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, WIREFRAME_DEFAULTS);
	}

	/** Whether the plain program has linked and the effect can draw. */
	get ready(): boolean {
		return this.programs?.ready(0) !== null;
	}

	/**
	 * Starts compiling the plain wireframe program. The variants for the
	 * deform and the glitch compile when a frame first needs them.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.programs = new ProgramVariants(
			compilerFor(gl),
			wireframeVert,
			wireframeFrag,
			MODEL_FEATURE_NAMES,
			MODEL_ATTRIB_LOCATIONS,
		);
		this.programs.get(0);
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
		if (ctx.shatterActive || !this.programs) return;

		const glitch = ctx.vertexGlitch;
		if (
			ctx.glitchActive &&
			glitch &&
			(glitch.unit === "triangle" || glitch.maskedColors.length > 0)
		) {
			return;
		}

		// The variant matching the model's, else the last one drawn with
		// until it has compiled, else the plain one.
		const key = ctx.modelFeatures & WIREFRAME_FEATURES;
		let program = this.programs.get(key).info;
		if (program) {
			this.lastKey = key;
		} else {
			program = this.programs.ready(this.lastKey) ?? this.programs.ready(0);
		}
		if (!program) return;

		const gl = ctx.gl;

		gl.useProgram(program.program);
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
			ctx.deformPhase,
			ctx.cameraPos,
		);
		uniforms.u_time = ctx.time;
		writeVertexGlitchUniforms(
			uniforms,
			ctx.vertexGlitch,
			ctx.glitchActive,
			ctx.glitchPhase,
			resources.bounds,
			ctx.cameraPos,
		);

		for (const nb of resources.nodeBuffers) {
			if (!nb.node.renderVisible || nb.node.ghost || !nb.wireframe) continue;

			uniforms.u_worldMatrix = nb.node.worldMatrix;
			uniforms.u_nodeBits = ctx.nodeBits.get(nb.node) ?? 0;
			uniforms.u_voxelSide = nb.voxelSide ?? -1;

			gl.bindVertexArray(nb.wireframe.vao);
			twgl.setUniforms(program, uniforms);
			gl.drawArrays(gl.LINES, 0, nb.wireframe.vertexCount);

			ctx.stats.drawCalls++;
		}

		gl.bindVertexArray(null);
		gl.disable(gl.DEPTH_TEST);
	}

	/**
	 * Frees the shader programs.
	 */
	dispose(): void {
		if (!this.gl) return;

		if (this.programs) {
			this.programs.dispose();
			this.programs = null;
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
