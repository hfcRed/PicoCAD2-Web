import * as twgl from "twgl.js";
import {
	CAMERA_FAR,
	CAMERA_NEAR,
	CAMERA_ORTHO_NEAR,
} from "../../camera/orbit-camera.ts";
import depthFogFrag from "../../shaders/effects/depth-fog.frag";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import type { DepthFogOptions } from "../../types/options.ts";
import { compilerFor, type ManagedProgram } from "../program-cache.ts";
import { packColorMask } from "./color-mask.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
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
	private program: ManagedProgram | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;

	readonly id = "depthFog";
	initialized = false;

	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, DEPTH_FOG_DEFAULTS);
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
		this.program = compilerFor(gl).compile(fullscreenVert, depthFogFrag);
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
		const info = this.program?.info;
		if (!info) return;
		const gl = ctx.gl;

		gl.useProgram(info.program);

		twgl.setUniforms(info, {
			u_texture: inputTexture,
			u_depthTexture: ctx.depthTexture,
			u_modelOnly: this.modelOnly,
			u_bgIsTransparent: ctx.bgIsTransparent,
			u_indexTexture: ctx.indexTexture,
			u_colorMask: packColorMask(this.maskedColors),
			u_fogColor: this.color,
			u_near: this.near,
			u_far: this.far,
			u_density: this.density,
			u_mode: FOG_MODE_MAP[this.mode],
			u_camNear: ctx.isOrthographic ? CAMERA_ORTHO_NEAR : CAMERA_NEAR,
			u_camFar: CAMERA_FAR,
			u_orthographic: ctx.isOrthographic,
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

export interface DepthFogEffect extends Required<DepthFogOptions> {}

/** Default settings for {@link DepthFogEffect}. */
export const DEPTH_FOG_DEFAULTS = deepFreeze<DeepRequired<DepthFogOptions>>({
	enabled: false,
	modelOnly: true,
	color: [0.8, 0.85, 0.9],
	near: 0.1,
	far: 50,
	density: 0.05,
	mode: "linear",
	maskedColors: [],
});
