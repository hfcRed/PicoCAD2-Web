import * as twgl from "twgl.js";
import bloomBlurFrag from "../../shaders/effects/bloom-blur.frag";
import bloomCompositeFrag from "../../shaders/effects/bloom-composite.frag";
import bloomThresholdFrag from "../../shaders/effects/bloom-threshold.frag";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import type { EffectContext, PostProcessEffect } from "./types.ts";

/**
 * Multi-pass bloom effect with threshold extraction, separable Gaussian blur,
 * and additive compositing. Manages its own intermediate FBOs for the blur passes.
 */
export class BloomEffect implements PostProcessEffect {
	readonly id = "bloom";
	enabled = false;
	initialized = false;
	modelOnly = true;
	threshold = 0.8;
	intensity = 1.0;
	blur = 4.0;

	private gl: WebGL2RenderingContext | null = null;
	private thresholdProgram: twgl.ProgramInfo | null = null;
	private blurProgram: twgl.ProgramInfo | null = null;
	private compositeProgram: twgl.ProgramInfo | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;

	private fboA: WebGLFramebuffer | null = null;
	private texA: WebGLTexture | null = null;
	private fboB: WebGLFramebuffer | null = null;
	private texB: WebGLTexture | null = null;
	private internalWidth = 0;
	private internalHeight = 0;

	/**
	 * Compiles all bloom shader programs.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.thresholdProgram = twgl.createProgramInfo(gl, [
			fullscreenVert,
			bloomThresholdFrag,
		]);
		this.blurProgram = twgl.createProgramInfo(gl, [
			fullscreenVert,
			bloomBlurFrag,
		]);
		this.compositeProgram = twgl.createProgramInfo(gl, [
			fullscreenVert,
			bloomCompositeFrag,
		]);
		this.emptyVao = gl.createVertexArray();
		this.initialized = true;
	}

	/**
	 * Applies the bloom effect in 4 passes:
	 * 1. Threshold extraction -> internal fboA
	 * 2. Horizontal Gaussian blur -> internal fboB
	 * 3. Vertical Gaussian blur -> internal fboA
	 * 4. Additive composite (original + blurred bloom) -> pipeline output FBO
	 *
	 * The pipeline binds the output FBO before calling this method.
	 * We save and restore it around our internal passes.
	 *
	 * @param ctx - The rendering context info.
	 * @param inputTexture - The scene texture to read from.
	 */
	apply(ctx: EffectContext, inputTexture: WebGLTexture): void {
		const gl = ctx.gl;

		this.ensureInternalFbos(gl, ctx.width, ctx.height);

		const outputFbo = gl.getParameter(
			gl.FRAMEBUFFER_BINDING,
		) as WebGLFramebuffer | null;

		gl.bindVertexArray(this.emptyVao);
		gl.disable(gl.DEPTH_TEST);

		// Pass 1: Threshold
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
		gl.viewport(0, 0, ctx.width, ctx.height);
		gl.useProgram(this.thresholdProgram!.program);
		twgl.setUniforms(this.thresholdProgram!, {
			u_texture: inputTexture,
			u_threshold: this.threshold,
			u_modelOnly: this.modelOnly,
		});
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// Pass 2:
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
		gl.useProgram(this.blurProgram!.program);
		twgl.setUniforms(this.blurProgram!, {
			u_texture: this.texA,
			u_blur: this.blur,
			u_resolution: [ctx.width, ctx.height],
			u_direction: [1.0, 0.0],
		});
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// Pass 3: Vertical blur
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
		gl.useProgram(this.blurProgram!.program);
		twgl.setUniforms(this.blurProgram!, {
			u_texture: this.texB,
			u_blur: this.blur,
			u_resolution: [ctx.width, ctx.height],
			u_direction: [0.0, 1.0],
		});
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// Pass 4: Composite
		gl.bindFramebuffer(gl.FRAMEBUFFER, outputFbo);
		gl.viewport(0, 0, ctx.width, ctx.height);
		gl.useProgram(this.compositeProgram!.program);
		twgl.setUniforms(this.compositeProgram!, {
			u_texture: inputTexture,
			u_bloomTexture: this.texA,
			u_intensity: this.intensity,
			u_modelOnly: this.modelOnly,
		});
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		gl.bindVertexArray(null);
	}

	/**
	 * Frees all GPU resources.
	 */
	dispose(): void {
		if (!this.gl) return;
		const gl = this.gl;

		if (this.thresholdProgram) {
			gl.deleteProgram(this.thresholdProgram.program);
			this.thresholdProgram = null;
		}
		if (this.blurProgram) {
			gl.deleteProgram(this.blurProgram.program);
			this.blurProgram = null;
		}
		if (this.compositeProgram) {
			gl.deleteProgram(this.compositeProgram.program);
			this.compositeProgram = null;
		}
		if (this.emptyVao) {
			gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}

		this.disposeInternalFbos(gl);
		this.initialized = false;
		this.gl = null;
	}

	/**
	 * Ensures internal FBOs match the given dimensions.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @param w - The required width.
	 * @param h - The required height.
	 */
	private ensureInternalFbos(
		gl: WebGL2RenderingContext,
		w: number,
		h: number,
	): void {
		if (this.fboA && this.internalWidth === w && this.internalHeight === h)
			return;

		this.disposeInternalFbos(gl);

		const createFboTexPair = (): {
			fbo: WebGLFramebuffer;
			tex: WebGLTexture;
		} => {
			const fbo = gl.createFramebuffer()!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

			const tex = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				w,
				h,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				null,
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				tex,
				0,
			);

			return { fbo, tex };
		};

		const a = createFboTexPair();
		this.fboA = a.fbo;
		this.texA = a.tex;

		const b = createFboTexPair();
		this.fboB = b.fbo;
		this.texB = b.tex;

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.internalWidth = w;
		this.internalHeight = h;
	}

	/**
	 * Frees the internal FBO resources.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	private disposeInternalFbos(gl: WebGL2RenderingContext): void {
		if (this.fboA) {
			gl.deleteFramebuffer(this.fboA);
			this.fboA = null;
		}
		if (this.texA) {
			gl.deleteTexture(this.texA);
			this.texA = null;
		}
		if (this.fboB) {
			gl.deleteFramebuffer(this.fboB);
			this.fboB = null;
		}
		if (this.texB) {
			gl.deleteTexture(this.texB);
			this.texB = null;
		}
		this.internalWidth = 0;
		this.internalHeight = 0;
	}
}
