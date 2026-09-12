import * as twgl from "twgl.js";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import { compilerFor, type ManagedProgram } from "../program-cache.ts";
import { packColorMask } from "./color-mask.ts";
import type { EffectContext, PostProcessEffect } from "./types.ts";

interface MaskSettings {
	modelOnly?: boolean;
	maskedColors?: readonly number[];
}

/**
 * Reads an effect's mask settings, whether or not it declares them.
 *
 * @param effect - The effect.
 * @returns The settings it carries.
 */
function maskSettingsOf(effect: object): MaskSettings {
	return effect as MaskSettings;
}

/**
 * A single-pass fullscreen post-process effect.
 * Handles shader compilation, empty VAO management, and fullscreen triangle rendering.
 * Callers provide the fragment shader source and a `getUniforms` callback.
 *
 * The program compiles through the context's compiler, in the background
 * where the browser allows, and the effect reports itself not ready until
 * the link has finished, so enabling it never stalls the frame.
 *
 * `modelOnly` and `maskedColors` are not declared here. An effect whose
 * options include them gets them through its declaration merging, and the
 * base draw reads them when present, so an effect whose shader ignores
 * them does not expose inert settings.
 */
export class FullscreenEffect implements PostProcessEffect {
	private program: ManagedProgram | null = null;
	protected gl: WebGL2RenderingContext | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;
	protected readonly fragSource: string;
	private readonly getUniformsFn: (
		ctx: EffectContext,
	) => Record<string, unknown>;

	readonly id: string;
	readonly warpsIndex: boolean;
	enabled = false;
	initialized = false;

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

	/** Whether a program has linked and the effect can draw. */
	get ready(): boolean {
		return this.programInfo() !== null;
	}

	/**
	 * Starts compiling the shader program and creates the empty VAO.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.initPrograms(gl);
		this.emptyVao = gl.createVertexArray();
		this.initialized = true;
	}

	/**
	 * Starts compiling the effect's program. An effect with several
	 * variants overrides this, {@link programInfo} and
	 * {@link disposePrograms}.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	protected initPrograms(gl: WebGL2RenderingContext): void {
		this.program = compilerFor(gl).compile(fullscreenVert, this.fragSource);
	}

	/**
	 * The program to draw with, or null while it links.
	 *
	 * @returns The ready program info, or null.
	 */
	protected programInfo(): twgl.ProgramInfo | null {
		return this.program?.info ?? null;
	}

	/**
	 * Frees the effect's programs.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	protected disposePrograms(gl: WebGL2RenderingContext): void {
		if (!this.program) return;
		compilerFor(gl).forget(this.program);
		this.program.dispose(gl);
		this.program = null;
	}

	/**
	 * Applies the effect by drawing a fullscreen triangle with the effect shader.
	 *
	 * @param ctx - The rendering context info.
	 * @param inputTexture - The texture to read from.
	 */
	apply(ctx: EffectContext, inputTexture: WebGLTexture): void {
		const info = this.programInfo();
		if (!info) return;
		const gl = ctx.gl;

		gl.useProgram(info.program);
		const mask = maskSettingsOf(this);
		twgl.setUniforms(info, {
			u_texture: inputTexture,
			u_modelOnly: mask.modelOnly ?? true,
			u_bgIsTransparent: ctx.bgIsTransparent,
			u_indexTexture: ctx.indexTexture,
			u_colorMask: packColorMask(mask.maskedColors ?? []),
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

		this.disposePrograms(this.gl);
		if (this.emptyVao) {
			this.gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}

		this.initialized = false;
		this.gl = null;
	}
}
