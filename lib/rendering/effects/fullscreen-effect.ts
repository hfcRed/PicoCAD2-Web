import * as twgl from "twgl.js";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import type { EffectContext, PostProcessEffect } from "./types.ts";

/**
 * A single-pass fullscreen post-process effect.
 * Handles shader compilation, empty VAO management, and fullscreen triangle rendering.
 * Callers provide the fragment shader source and a `getUniforms` callback.
 */
export class FullscreenEffect implements PostProcessEffect {
	private program: twgl.ProgramInfo | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;
	private readonly fragSource: string;
	private readonly getUniformsFn: (
		ctx: EffectContext,
	) => Record<string, unknown>;

	readonly id: string;
	enabled = false;
	initialized = false;
	modelOnly = true;

	/**
	 * Creates a new fullscreen effect.
	 *
	 * @param id - Unique identifier for this effect.
	 * @param fragSource - The GLSL fragment shader source string.
	 * @param getUniforms - Callback that returns uniform values for the shader. The base class automatically sets `u_texture`.
	 */
	constructor(
		id: string,
		fragSource: string,
		getUniforms: (ctx: EffectContext) => Record<string, unknown>,
	) {
		this.id = id;
		this.fragSource = fragSource;
		this.getUniformsFn = getUniforms;
	}

	/**
	 * Compiles the shader program and creates the empty VAO.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.program = twgl.createProgramInfo(gl, [
			fullscreenVert,
			this.fragSource,
		]);
		this.emptyVao = gl.createVertexArray();
		this.initialized = true;
	}

	/**
	 * Applies the effect by drawing a fullscreen triangle with the effect shader.
	 *
	 * @param ctx - The rendering context info.
	 * @param inputTexture - The texture to read from.
	 */
	apply(ctx: EffectContext, inputTexture: WebGLTexture): void {
		const gl = ctx.gl;

		gl.useProgram(this.program!.program);
		twgl.setUniforms(this.program!, {
			u_texture: inputTexture,
			u_modelOnly: this.modelOnly,
			...this.getUniformsFn(ctx),
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
