import * as twgl from "twgl.js";
import blitFrag from "../../shaders/effects/blit.frag";
import fullscreenVert from "../../shaders/effects/fullscreen.vert";
import resolveFrag from "../../shaders/effects/resolve.frag";
import type { Color3 } from "../../types/scene.ts";
import type { RenderStats } from "../renderer.ts";
import { FramebufferPool } from "./framebuffer-pool.ts";
import type { EffectContext, PostProcessEffect, SceneEffect } from "./types.ts";

/**
 * Manages and executes a chain of post-process effects using framebuffer ping-pong.
 * Also holds scene effects that render geometry into the scene FBO.
 */
export class PostProcessPipeline {
	private readonly postEffects: PostProcessEffect[] = [];
	private readonly sceneEffectsList: SceneEffect[] = [];
	private blitProgram: twgl.ProgramInfo | null = null;
	private resolveProgram: twgl.ProgramInfo | null = null;
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
		const effects = this.postEffects;
		for (let i = 0; i < effects.length; i++) {
			if (effects[i].id === id) return effects[i];
		}
		return undefined;
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
	 * Gets a scene effect by id.
	 *
	 * @param id - The effect id.
	 * @returns The effect, or undefined if not found.
	 */
	getSceneEffect(id: string): SceneEffect | undefined {
		const effects = this.sceneEffectsList;
		for (let i = 0; i < effects.length; i++) {
			if (effects[i].id === id) return effects[i];
		}
		return undefined;
	}

	/**
	 * Returns true if any post-process effect is enabled.
	 *
	 * @returns Whether any post-process effect is active.
	 */
	hasActivePostEffects(): boolean {
		const effects = this.postEffects;
		for (let i = 0; i < effects.length; i++) {
			if (effects[i].enabled) return true;
		}
		return false;
	}

	/**
	 * Starts compiling the programs of every enabled effect that has not
	 * been initialized yet, so a caller can wait for them.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	initEnabledEffects(gl: WebGL2RenderingContext): void {
		for (const effect of this.postEffects) {
			if (effect.enabled && !effect.initialized) effect.init(gl);
		}
		for (const effect of this.sceneEffectsList) {
			if (effect.enabled && !effect.initialized) effect.init(gl);
		}
	}

	/**
	 * Returns true if any scene effect is enabled.
	 *
	 * @returns Whether any scene effect is active.
	 */
	hasActiveSceneEffects(): boolean {
		const effects = this.sceneEffectsList;
		for (let i = 0; i < effects.length; i++) {
			if (effects[i].enabled) return true;
		}
		return false;
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
	 * @param bgIsTransparent - Whether the background renders as transparent.
	 * @param x - The output viewport x offset in the default framebuffer.
	 * @param y - The output viewport y offset in the default framebuffer.
	 * @param resolve - Whether the scene is premultiplied over transparent
	 *   black on an opaque background and must be composited over the
	 *   background color before the chain proper. See {@link resolve}.
	 */
	execute(
		ctx: EffectContext,
		backgroundColor: Color3,
		bgIsTransparent = false,
		x = 0,
		y = 0,
		resolve = false,
	): void {
		const gl = ctx.gl;
		let resolvePending = resolve;

		for (const effect of this.postEffects) {
			// The gradient outline reads the true coverage and writes
			// premultiplied like the scene, so the resolve runs right after
			// it. The procedural background composites the fades over its
			// pattern itself and takes the resolve's place when enabled.
			if (resolvePending && effect.id !== "gradientOutline") {
				resolvePending = false;
				if (!(effect.id === "proceduralBackground" && effect.enabled)) {
					this.resolve(ctx, backgroundColor);
				}
			}

			if (!effect.enabled) continue;

			if (!effect.initialized) {
				effect.init(gl);
			}

			if (effect.ready === false) continue;

			const inputTexture = this.pool.swap(gl);
			gl.viewport(0, 0, ctx.width, ctx.height);
			gl.disable(gl.DEPTH_TEST);

			// Warping effects carry the palette index buffer alongside their
			// color output so masks stay valid after the warp: they read the
			// current index texture and write the other one of the pair.
			if (effect.warpsIndex) {
				this.pool.attachIndexTarget(gl);
				effect.apply(ctx, inputTexture);
				this.pool.resolveIndexTarget(gl);
				ctx.indexTexture = this.pool.getIndexTexture();
			} else {
				effect.apply(ctx, inputTexture);
			}
		}

		if (resolvePending) this.resolve(ctx, backgroundColor);

		this.blit(
			gl,
			x,
			y,
			ctx.width,
			ctx.height,
			backgroundColor,
			bgIsTransparent,
			ctx.stats,
		);
	}

	/**
	 * Composites the current pool texture to the default framebuffer,
	 * blending the scene over the background color using alpha.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @param x - The output viewport x offset in the default framebuffer.
	 * @param y - The output viewport y offset in the default framebuffer.
	 * @param w - The render width.
	 * @param h - The render height.
	 * @param backgroundColor - The background color for compositing.
	 * @param stats - Render stats to count the composite draw against.
	 */
	blit(
		gl: WebGL2RenderingContext,
		x: number,
		y: number,
		w: number,
		h: number,
		backgroundColor: Color3,
		bgIsTransparent = false,
		stats?: RenderStats,
	): void {
		if (!this.blitProgram) {
			this.blitProgram = twgl.createProgramInfo(gl, [fullscreenVert, blitFrag]);
			this.emptyVao = gl.createVertexArray();
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(x, y, w, h);
		gl.disable(gl.DEPTH_TEST);

		gl.useProgram(this.blitProgram.program);
		twgl.setUniforms(this.blitProgram, {
			u_texture: this.pool.getCurrentTexture(),
			u_backgroundColor: backgroundColor,
			u_bgIsTransparent: bgIsTransparent ? 1.0 : 0.0,
		});

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);

		if (stats) stats.drawCalls++;
	}

	/**
	 * Composites the current pool texture over the background color into the
	 * other pool texture, which becomes current. On an opaque background the
	 * chain holds straight color with alpha marking content, but while the
	 * scene pass draws smooth fades it blends premultiplied over transparent
	 * black instead, so the outlines can read the true coverage. This pass
	 * flattens that back. Content gets alpha 1, the background keeps 0.
	 *
	 * @param ctx - The rendering context info.
	 * @param backgroundColor - The background color to composite over.
	 */
	resolve(ctx: EffectContext, backgroundColor: Color3): void {
		const gl = ctx.gl;
		if (!this.resolveProgram) {
			this.resolveProgram = twgl.createProgramInfo(gl, [
				fullscreenVert,
				resolveFrag,
			]);
		}
		if (!this.emptyVao) this.emptyVao = gl.createVertexArray();

		const inputTexture = this.pool.swap(gl);
		gl.viewport(0, 0, ctx.width, ctx.height);
		gl.disable(gl.DEPTH_TEST);

		gl.useProgram(this.resolveProgram.program);
		twgl.setUniforms(this.resolveProgram, {
			u_texture: inputTexture,
			u_backgroundColor: backgroundColor,
		});

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);

		ctx.stats.drawCalls++;
	}

	/**
	 * Disposes and removes all effects without destroying pipeline resources.
	 */
	clearEffects(): void {
		for (const effect of this.postEffects) {
			effect.dispose();
		}
		for (const effect of this.sceneEffectsList) {
			effect.dispose();
		}
		this.postEffects.length = 0;
		this.sceneEffectsList.length = 0;
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
		if (this.resolveProgram) {
			gl.deleteProgram(this.resolveProgram.program);
			this.resolveProgram = null;
		}
		if (this.emptyVao) {
			gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}
	}
}
