interface ManagedFramebuffer {
	fbo: WebGLFramebuffer;
	texture: WebGLTexture;
}

/** Clear value for the palette index attachment: R = 255 marks "no model pixel". */
const INDEX_CLEAR = new Float32Array([1, 0, 0, 0]);

/**
 * Manages a pair of framebuffers for ping-pong rendering.
 * The scene FBO (index 0) has a depth attachment for 3D rendering and a
 * palette index attachment (RG8: base palette index, shade row) written by
 * the model shader for effect color masks.
 * The swap FBO (index 1) is color-only for post-processing passes.
 *
 * The palette index has its own ping-pong pair so UV-warping effects can
 * carry it alongside their color output ({@link attachIndexTarget} /
 * {@link resolveIndexTarget}), keeping masks valid after warps. The scene
 * pass always writes index texture 0. {@link getIndexTexture} returns
 * whichever texture is current.
 */
export class FramebufferPool {
	private depthTexture: WebGLTexture | null = null;
	private indexTextures: [WebGLTexture | null, WebGLTexture | null] = [
		null,
		null,
	];
	private indexCurrent = 0;
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

		// Palette index ping-pong pair. NEAREST is required: index values
		// must be copied, never interpolated.
		for (let i = 0; i < 2; i++) {
			const texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RG8,
				w,
				h,
				0,
				gl.RG,
				gl.UNSIGNED_BYTE,
				null,
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			this.indexTextures[i] = texture;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[0]!.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.TEXTURE_2D,
			this.depthTexture,
			0,
		);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT1,
			gl.TEXTURE_2D,
			this.indexTextures[0],
			0,
		);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.width = w;
		this.height = h;
		this.currentIndex = 0;
		this.indexCurrent = 0;
	}

	/**
	 * Binds the scene FBO (with depth and index attachments) for 3D rendering.
	 * Reattaches the textures if they were previously detached and enables
	 * drawing to both color attachments. The scene pass always writes index
	 * texture 0, so the index ping-pong resets here.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	bindScene(gl: WebGL2RenderingContext): void {
		this.currentIndex = 0;
		this.indexCurrent = 0;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[0]!.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.TEXTURE_2D,
			this.depthTexture,
			0,
		);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT1,
			gl.TEXTURE_2D,
			this.indexTextures[0],
			0,
		);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
	}

	/**
	 * Clears the palette index attachment to "no model pixel" (index 255).
	 * Call after the regular scene clear while the scene FBO is bound with
	 * both draw buffers enabled.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	clearIndex(gl: WebGL2RenderingContext): void {
		gl.clearBufferfv(gl.COLOR, 1, INDEX_CLEAR);
	}

	/**
	 * Disables drawing to the palette index attachment. Call once the model
	 * has been drawn, so passes whose shaders don't declare a second output
	 * (wireframe, outline, post effects) leave the index buffer intact.
	 * The scene FBO must be bound.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	disableIndexWrites(gl: WebGL2RenderingContext): void {
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
	}

	/**
	 * Detaches the depth and palette index textures from the scene FBO so
	 * they can be safely sampled during post-processing without causing a
	 * feedback loop.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	detachSceneTextures(gl: WebGL2RenderingContext): void {
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[0]!.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.TEXTURE_2D,
			null,
			0,
		);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT1,
			gl.TEXTURE_2D,
			null,
			0,
		);
	}

	/**
	 * Attaches the non-current palette index texture as the second color
	 * attachment of the currently bound ping-pong FBO, so a warping effect
	 * can write the index through alongside its color output. The effect
	 * samples the current index texture, so no feedback loop forms.
	 * Call after {@link swap}, before the effect draws.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	attachIndexTarget(gl: WebGL2RenderingContext): void {
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT1,
			gl.TEXTURE_2D,
			this.indexTextures[1 - this.indexCurrent],
			0,
		);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
	}

	/**
	 * Detaches the index target attached by {@link attachIndexTarget} and
	 * makes the just-written texture the current index. Call after the
	 * warping effect has drawn, while its FBO is still bound.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	resolveIndexTarget(gl: WebGL2RenderingContext): void {
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT1,
			gl.TEXTURE_2D,
			null,
			0,
		);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
		this.indexCurrent = 1 - this.indexCurrent;
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
	 * Returns the current palette index texture for sampling in effects
	 * (R = base palette index, 255 = no model; G = shade row). After a
	 * warping effect resolves, this is the warped copy.
	 *
	 * @returns The index texture, or null if not yet created.
	 */
	getIndexTexture(): WebGLTexture | null {
		return this.indexTextures[this.indexCurrent];
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

			const indexTexture = this.indexTextures[i];
			if (indexTexture) {
				gl.deleteTexture(indexTexture);
				this.indexTextures[i] = null;
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
