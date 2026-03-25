import * as twgl from "twgl.js";
import depthFogFrag from "../../shaders/effects/depth-fog.frag";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import type { EffectContext, PostProcessEffect } from "./types.ts";

/** Fog falloff mode. */
export type FogMode = "linear" | "exponential" | "exponentialSquared";

const FOG_MODE_MAP: Record<FogMode, number> = {
	linear: 0,
	exponential: 1,
	exponentialSquared: 2,
};

/**
 * Adds atmospheric fog based on scene depth.
 * Requires the depth texture from the scene FBO.
 */
export class DepthFogEffect implements PostProcessEffect {
	private program: twgl.ProgramInfo | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;

	readonly id = "depthFog";
	enabled = false;
	initialized = false;
	modelOnly = true;

	color: [number, number, number] = [0.8, 0.85, 0.9];
	near = 0.1;
	far = 50.0;
	density = 0.05;
	mode: FogMode = "linear";

	/**
	 * Compiles the shader program and creates the empty VAO.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.program = twgl.createProgramInfo(gl, [fullscreenVert, depthFogFrag]);
		this.emptyVao = gl.createVertexArray();
		this.initialized = true;
	}

	/**
	 * Applies the depth fog effect.
	 *
	 * @param ctx - The rendering context info.
	 * @param inputTexture - The color texture to read from.
	 */
	apply(ctx: EffectContext, inputTexture: WebGLTexture): void {
		const gl = ctx.gl;

		gl.useProgram(this.program!.program);

		twgl.setUniforms(this.program!, {
			u_texture: inputTexture,
			u_depthTexture: ctx.depthTexture,
			u_modelOnly: this.modelOnly,
			u_fogColor: this.color,
			u_near: this.near,
			u_far: this.far,
			u_density: this.density,
			u_mode: FOG_MODE_MAP[this.mode],
		});

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}

	/**
	 * Frees the shader program and VAO.
	 */
	dispose(): void {
		if (!this.gl) return;

		if (this.program) {
			this.gl.deleteProgram(this.program.program);
			this.program = null;
		}
		if (this.emptyVao) {
			this.gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}

		this.initialized = false;
		this.gl = null;
	}
}
