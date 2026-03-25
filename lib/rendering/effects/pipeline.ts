import * as twgl from "twgl.js";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import type { Color3 } from "../../types/scene.ts";
import { FramebufferPool } from "./framebuffer-pool.ts";
import type { EffectContext, PostProcessEffect, SceneEffect } from "./types.ts";

/** Composite fragment shader that blends the FBO over the background color using alpha. */
const BLIT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_backgroundColor;
out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    fragColor = vec4(mix(u_backgroundColor, col.rgb, col.a), 1.0);
}
`;

/**
 * Manages and executes a chain of post-process effects using framebuffer ping-pong.
 * Also holds scene effects that render geometry into the scene FBO.
 */
export class PostProcessPipeline {
	private readonly postEffects: PostProcessEffect[] = [];
	private readonly sceneEffectsList: SceneEffect[] = [];
	private blitProgram: twgl.ProgramInfo | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;
	readonly pool: FramebufferPool = new FramebufferPool();

	/**
	 * Adds a post-process effect to the end of the chain.
	 *
	 * @param effect - The effect to add.
	 */
	addPostEffect(effect: PostProcessEffect): void {
		this.postEffects.push(effect);
	}

	/**
	 * Removes a post-process effect by id and disposes it.
	 *
	 * @param id - The effect id to remove.
	 */
	removePostEffect(id: string): void {
		const idx = this.postEffects.findIndex((e) => e.id === id);
		if (idx < 0) return;
		this.postEffects[idx].dispose();
		this.postEffects.splice(idx, 1);
	}

	/**
	 * Gets a post-process effect by id.
	 *
	 * @param id - The effect id.
	 * @returns The effect, or undefined if not found.
	 */
	getPostEffect(id: string): PostProcessEffect | undefined {
		return this.postEffects.find((e) => e.id === id);
	}

	/**
	 * Adds a scene effect.
	 *
	 * @param effect - The scene effect to add.
	 */
	addSceneEffect(effect: SceneEffect): void {
		this.sceneEffectsList.push(effect);
	}

	/**
	 * Removes a scene effect by id and disposes it.
	 *
	 * @param id - The scene effect id to remove.
	 */
	removeSceneEffect(id: string): void {
		const idx = this.sceneEffectsList.findIndex((e) => e.id === id);
		if (idx < 0) return;
		this.sceneEffectsList[idx].dispose();
		this.sceneEffectsList.splice(idx, 1);
	}

	/**
	 * Returns the list of scene effects.
	 *
	 * @returns The scene effects array.
	 */
	get sceneEffects(): readonly SceneEffect[] {
		return this.sceneEffectsList;
	}

	/**
	 * Returns true if any post-process effect is enabled.
	 *
	 * @returns Whether any post-process effect is active.
	 */
	hasActivePostEffects(): boolean {
		return this.postEffects.some((e) => e.enabled);
	}

	/**
	 * Returns true if any scene effect is enabled.
	 *
	 * @returns Whether any scene effect is active.
	 */
	hasActiveSceneEffects(): boolean {
		return this.sceneEffectsList.some((e) => e.enabled);
	}

	/**
	 * Returns true if any effect (post-process or scene) is enabled.
	 *
	 * @returns Whether any effect is active.
	 */
	hasActiveEffects(): boolean {
		return this.hasActivePostEffects() || this.hasActiveSceneEffects();
	}

	/**
	 * Runs all enabled post-process effects in order via ping-pong,
	 * then composites the final result to the default framebuffer.
	 *
	 * @param ctx - The rendering context info.
	 * @param backgroundColor - The background color for the final composite.
	 */
	execute(ctx: EffectContext, backgroundColor: Color3): void {
		const gl = ctx.gl;

		for (const effect of this.postEffects) {
			if (!effect.enabled) continue;

			if (!effect.initialized) {
				effect.init(gl);
			}

			const inputTexture = this.pool.swap(gl);
			gl.viewport(0, 0, ctx.width, ctx.height);
			gl.disable(gl.DEPTH_TEST);
			effect.apply(ctx, inputTexture);
		}

		this.blit(gl, ctx.width, ctx.height, backgroundColor);
	}

	/**
	 * Composites the current pool texture to the default framebuffer,
	 * blending the scene over the background color using alpha.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @param w - The render width.
	 * @param h - The render height.
	 * @param backgroundColor - The background color for compositing.
	 */
	blit(
		gl: WebGL2RenderingContext,
		w: number,
		h: number,
		backgroundColor: Color3,
	): void {
		if (!this.blitProgram) {
			this.blitProgram = twgl.createProgramInfo(gl, [
				fullscreenVert,
				BLIT_FRAG,
			]);
			this.emptyVao = gl.createVertexArray();
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, w, h);
		gl.disable(gl.DEPTH_TEST);

		gl.useProgram(this.blitProgram.program);
		twgl.setUniforms(this.blitProgram, {
			u_texture: this.pool.getCurrentTexture(),
			u_backgroundColor: backgroundColor,
		});

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}

	/**
	 * Frees all GPU resources held by this pipeline.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	dispose(gl: WebGL2RenderingContext): void {
		for (const effect of this.postEffects) {
			effect.dispose();
		}
		for (const effect of this.sceneEffectsList) {
			effect.dispose();
		}
		this.postEffects.length = 0;
		this.sceneEffectsList.length = 0;
		this.pool.dispose(gl);

		if (this.blitProgram) {
			gl.deleteProgram(this.blitProgram.program);
			this.blitProgram = null;
		}
		if (this.emptyVao) {
			gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}
	}
}
