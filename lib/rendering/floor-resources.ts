import { mat4 } from "gl-matrix";
import * as twgl from "twgl.js";
import floorFrag from "../shaders/floor.frag";
import floorVert from "../shaders/floor.vert";
import type { Color3 } from "../types/scene.ts";
import { compilerFor, type ManagedProgram } from "./program-cache.ts";

export const FLOOR_SHADOW_MAP_SIZE = 512;

/**
 * GPU resources of the floor effect, owned by the renderer and created on
 * first use. The plate program, the depth-only shadow map the model is
 * drawn into along the shadow direction, and the reflection framebuffer
 * the mirrored model pass renders into.
 *
 * The reflection framebuffer carries a second color attachment that is
 * never read, so the mirrored pass draws with the same two-output program
 * variant as the scene pass. A program drawn into a different set of
 * draw buffers costs a full recompile on some drivers.
 */
export class FloorResources {
	private program: ManagedProgram | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;
	private shadowFbo: WebGLFramebuffer | null = null;
	shadowTexture: WebGLTexture | null = null;
	private reflectionFbo: WebGLFramebuffer | null = null;
	reflectionTexture: WebGLTexture | null = null;
	private reflectionIndex: WebGLTexture | null = null;
	private reflectionDepth: WebGLRenderbuffer | null = null;
	private reflectionWidth = 0;
	private reflectionHeight = 0;
	readonly lightVp = mat4.create();
	readonly mirror = mat4.create();
	readonly uniforms = {
		u_vp: mat4.create() as mat4,
		u_floorCenter: [0, 0, 0] as Color3,
		u_floorHalf: 1,
		u_floorColor: [0, 0, 0] as Color3,
		u_floorFade: 0,
		u_floorSmooth: false,
		u_floorGridOn: false,
		u_floorGridSpacing: 1,
		u_floorGridThickness: 1,
		u_floorGridColor: [0, 0, 0] as Color3,
		u_floorSurface: true,
		u_floorShadowOn: false,
		u_floorLightVp: this.lightVp,
		u_floorShadowMap: null as WebGLTexture | null,
		u_floorShadowColor: [0, 0, 0] as Color3,
		u_floorShadowStrength: 1,
		u_floorShadowSoftness: 0,
		u_floorReflectionOn: false,
		u_floorReflection: null as WebGLTexture | null,
		u_floorReflectionStrength: 0,
		u_resolution: [1, 1] as [number, number],
		u_viewportOrigin: [0, 0] as [number, number],
		u_smoothTransparency: false,
	};

	/**
	 * Binds the shadow map for a depth-only model pass and clears it,
	 * creating it on first use.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	bindShadowMap(gl: WebGL2RenderingContext): void {
		if (!this.shadowFbo) {
			const size = FLOOR_SHADOW_MAP_SIZE;
			this.shadowTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.DEPTH_COMPONENT24,
				size,
				size,
				0,
				gl.DEPTH_COMPONENT,
				gl.UNSIGNED_INT,
				null,
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			this.shadowFbo = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.DEPTH_ATTACHMENT,
				gl.TEXTURE_2D,
				this.shadowTexture,
				0,
			);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
		gl.drawBuffers([gl.NONE]);
		gl.viewport(0, 0, FLOOR_SHADOW_MAP_SIZE, FLOOR_SHADOW_MAP_SIZE);
		gl.clear(gl.DEPTH_BUFFER_BIT);
	}

	/**
	 * Binds the reflection framebuffer for the mirrored model pass and
	 * clears it to transparent, recreating it at the render size when that
	 * changes.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @param w - The render width in pixels.
	 * @param h - The render height in pixels.
	 */
	bindReflection(gl: WebGL2RenderingContext, w: number, h: number): void {
		if (
			!this.reflectionFbo ||
			w !== this.reflectionWidth ||
			h !== this.reflectionHeight
		) {
			this.disposeReflection(gl);

			this.reflectionTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.reflectionTexture);
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

			this.reflectionIndex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.reflectionIndex);
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

			this.reflectionDepth = gl.createRenderbuffer();
			gl.bindRenderbuffer(gl.RENDERBUFFER, this.reflectionDepth);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

			this.reflectionFbo = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflectionFbo);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				this.reflectionTexture,
				0,
			);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT1,
				gl.TEXTURE_2D,
				this.reflectionIndex,
				0,
			);
			gl.framebufferRenderbuffer(
				gl.FRAMEBUFFER,
				gl.DEPTH_ATTACHMENT,
				gl.RENDERBUFFER,
				this.reflectionDepth,
			);
			this.reflectionWidth = w;
			this.reflectionHeight = h;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflectionFbo);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
		gl.viewport(0, 0, w, h);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	/**
	 * Starts compiling the plate program if it has not been requested yet.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	ensureProgram(gl: WebGL2RenderingContext): void {
		if (this.program) return;
		this.program = compilerFor(gl).compile(floorVert, floorFrag);
		this.emptyVao = gl.createVertexArray();
	}

	/**
	 * Draws the plate quad with the current uniforms into the bound
	 * framebuffer, compiling the plate program on first use. Draws nothing
	 * while the program is still compiling.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @returns Whether the plate was drawn.
	 */
	drawPlane(gl: WebGL2RenderingContext): boolean {
		this.ensureProgram(gl);
		const info = this.program?.info;
		if (!info) return false;

		gl.useProgram(info.program);
		twgl.setUniforms(info, this.uniforms);
		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
		return true;
	}

	/**
	 * Frees every GPU resource.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	dispose(gl: WebGL2RenderingContext): void {
		this.disposeReflection(gl);
		if (this.shadowFbo) {
			gl.deleteFramebuffer(this.shadowFbo);
			this.shadowFbo = null;
		}
		if (this.shadowTexture) {
			gl.deleteTexture(this.shadowTexture);
			this.shadowTexture = null;
		}
		if (this.program) {
			compilerFor(gl).forget(this.program);
			this.program.dispose(gl);
			this.program = null;
		}
		if (this.emptyVao) {
			gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}
	}

	/**
	 * Frees the reflection framebuffer and its attachments.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	private disposeReflection(gl: WebGL2RenderingContext): void {
		if (this.reflectionFbo) {
			gl.deleteFramebuffer(this.reflectionFbo);
			this.reflectionFbo = null;
		}
		if (this.reflectionTexture) {
			gl.deleteTexture(this.reflectionTexture);
			this.reflectionTexture = null;
		}
		if (this.reflectionIndex) {
			gl.deleteTexture(this.reflectionIndex);
			this.reflectionIndex = null;
		}
		if (this.reflectionDepth) {
			gl.deleteRenderbuffer(this.reflectionDepth);
			this.reflectionDepth = null;
		}
		this.reflectionWidth = 0;
		this.reflectionHeight = 0;
	}
}
