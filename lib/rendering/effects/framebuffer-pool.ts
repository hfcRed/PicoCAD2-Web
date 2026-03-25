interface ManagedFramebuffer {
	fbo: WebGLFramebuffer;
	texture: WebGLTexture;
}

/**
 * Manages a pair of framebuffers for ping-pong rendering.
 * The scene FBO (index 0) has a depth attachment for 3D rendering.
 * The swap FBO (index 1) is color-only for post-processing passes.
 */
export class FramebufferPool {
	private depthTexture: WebGLTexture | null = null;
	private width = 0;
	private height = 0;
	private currentIndex = 0;
	private fbos: [ManagedFramebuffer | null, ManagedFramebuffer | null] = [
		null,
		null,
	];

	/**
	 * Ensures framebuffers match the given dimensions, recreating if needed.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @param w - The required width in pixels.
	 * @param h - The required height in pixels.
	 */
	ensure(gl: WebGL2RenderingContext, w: number, h: number): void {
		if (this.fbos[0] && this.width === w && this.height === h) return;

		this.disposeFbos(gl);

		for (let i = 0; i < 2; i++) {
			const fbo = gl.createFramebuffer()!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

			const texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, texture);
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
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				texture,
				0,
			);

			this.fbos[i] = { fbo, texture };
		}

		// Attach depth texture to the scene FBO only
		this.depthTexture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.DEPTH_COMPONENT24,
			w,
			h,
			0,
			gl.DEPTH_COMPONENT,
			gl.UNSIGNED_INT,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[0]!.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.TEXTURE_2D,
			this.depthTexture,
			0,
		);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.width = w;
		this.height = h;
		this.currentIndex = 0;
	}

	/**
	 * Binds the scene FBO (with depth attachment) for 3D rendering.
	 * Reattaches the depth texture if it was previously detached.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	bindScene(gl: WebGL2RenderingContext): void {
		this.currentIndex = 0;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[0]!.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.TEXTURE_2D,
			this.depthTexture,
			0,
		);
	}

	/**
	 * Detaches the depth texture from the scene FBO so it can be safely
	 * sampled during post-processing without causing a feedback loop.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	detachDepth(gl: WebGL2RenderingContext): void {
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[0]!.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.TEXTURE_2D,
			null,
			0,
		);
	}

	/**
	 * Returns the texture of the FBO that was most recently rendered to.
	 *
	 * @returns The current color texture.
	 */
	getCurrentTexture(): WebGLTexture {
		return this.fbos[this.currentIndex]!.texture;
	}

	/**
	 * Returns the depth texture from the scene FBO for sampling in effects.
	 *
	 * @returns The depth texture, or null if not yet created.
	 */
	getDepthTexture(): WebGLTexture | null {
		return this.depthTexture;
	}

	/**
	 * Performs a ping-pong swap, binds the other FBO as render target
	 * and returns the current FBO's texture as input.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @returns The texture to read from (the previously active FBO).
	 */
	swap(gl: WebGL2RenderingContext): WebGLTexture {
		const inputTexture = this.fbos[this.currentIndex]!.texture;
		this.currentIndex = 1 - this.currentIndex;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.currentIndex]!.fbo);
		return inputTexture;
	}

	/**
	 * Frees all GPU resources held by this pool.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	dispose(gl: WebGL2RenderingContext): void {
		this.disposeFbos(gl);
	}

	/**
	 * Frees the framebuffer resources.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	private disposeFbos(gl: WebGL2RenderingContext): void {
		for (let i = 0; i < 2; i++) {
			const managed = this.fbos[i];
			if (managed) {
				gl.deleteFramebuffer(managed.fbo);
				gl.deleteTexture(managed.texture);
				this.fbos[i] = null;
			}
		}

		if (this.depthTexture) {
			gl.deleteTexture(this.depthTexture);
			this.depthTexture = null;
		}

		this.width = 0;
		this.height = 0;
	}
}
