import * as twgl from "twgl.js";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import { compilerFor, type ManagedProgram } from "../program-cache.ts";
import { packColorMask } from "./color-mask.ts";
import type { EffectContext, PostProcessEffect } from "./types.ts";

/**
 * A single-pass fullscreen post-process effect.
 * Handles shader compilation, empty VAO management, and fullscreen triangle rendering.
 * Callers provide the fragment shader source and a `getUniforms` callback.
 *
 * The program compiles through the context's compiler, in the background
 * where the browser allows, and the effect reports itself not ready until
 * the link has finished, so enabling it never stalls the frame.
 */
export class FullscreenEffect implements PostProcessEffect {
	private program: ManagedProgram | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;
	private readonly fragSource: string;
	private readonly getUniformsFn: (
		ctx: EffectContext,
	) => Record<string, unknown>;

	readonly id: string;
	readonly warpsIndex: boolean;
	enabled = false;
	initialized = false;
	modelOnly = true;
	maskedColors: number[] = [];

	/**
	 * Creates a new fullscreen effect.
	 *
	 * @param id - Unique identifier for this effect.
	 * @param fragSource - The GLSL fragment shader source string.
	 * @param getUniforms - Callback that returns uniform values for the shader. The base class automatically sets `u_texture`, `u_modelOnly`, `u_bgIsTransparent`, `u_indexTexture` and `u_colorMask`.
	 * @param warpsIndex - True for effects that remap screen positions, their shader must write the palette index through as a second output (`fragIndex`).
	 */
	constructor(
		id: string,
		fragSource: string,
		getUniforms: (ctx: EffectContext) => Record<string, unknown>,
		warpsIndex = false,
	) {
		this.id = id;
		this.fragSource = fragSource;
		this.getUniformsFn = getUniforms;
		this.warpsIndex = warpsIndex;
	}

	/** Whether the program has linked and the effect can draw. */
	get ready(): boolean {
		return this.program?.ready === true;
	}

	/**
	 * Starts compiling the shader program and creates the empty VAO.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.program = compilerFor(gl).compile(fullscreenVert, this.fragSource);
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
		const info = this.program?.info;
		if (!info) return;
		const gl = ctx.gl;

		gl.useProgram(info.program);
		twgl.setUniforms(info, {
			u_texture: inputTexture,
			u_modelOnly: this.modelOnly,
			u_bgIsTransparent: ctx.bgIsTransparent,
			u_indexTexture: ctx.indexTexture,
			u_colorMask: packColorMask(this.maskedColors),
			...this.getUniformsFn(ctx),
		});

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);

		ctx.stats.drawCalls++;
	}

	/**
	 * Frees the shader program and VAO.
	 */
	dispose(): void {
		if (!this.gl) return;

		if (this.program) {
			compilerFor(this.gl).forget(this.program);
			this.program.dispose(this.gl);
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
