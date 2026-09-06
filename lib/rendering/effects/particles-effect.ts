import type { mat4 } from "gl-matrix";
import * as twgl from "twgl.js";
import particlesFrag from "../../shaders/particles.frag";
import particlesVert from "../../shaders/particles.vert";
import type { ParticlesOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import type { ModelResources } from "../renderer.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import type { EffectContext, SceneEffect } from "./types.ts";

export type ParticleShape =
	| "pixel"
	| "quad"
	| "cube"
	| "triangle"
	| "line"
	| "circle";

export type ParticleMotion = "drift" | "orbit" | "linear";

const MAX_PARTICLES = 10000;

const SHAPE_INDEX: Record<ParticleShape, number> = {
	pixel: 0,
	quad: 1,
	cube: 2,
	triangle: 3,
	line: 4,
	circle: 5,
};

const SHAPE_VERTICES: Record<ParticleShape, number> = {
	pixel: 6,
	quad: 6,
	cube: 36,
	triangle: 3,
	line: 6,
	circle: 6,
};

const MOTION_INDEX: Record<ParticleMotion, number> = {
	drift: 0,
	orbit: 1,
	linear: 2,
};

/**
 * Snow, rain, embers, sparkles or dust motes around the camera. One
 * attribute-less instanced draw of hashed particles, stateless and
 * looping. Depth writes stay off so particles never punch holes in each other.
 *
 * The particles fill a cube around the camera whose edge is `areaScale`
 * times the model's largest extent. They form a world-space lattice that
 * repeats every box length, and each particle renders the copy nearest the
 * camera, so the field is always in view while no particle ever moves with
 * the camera. World-sized shapes shrink to nothing in the camera's
 * immediate vicinity, so a particle passing through the camera never
 * flashes across the frame.
 *
 * `motion` layers a procedural movement style (scaled by `speed`) on top of
 * `velocity`, a constant directional movement in box lengths per second
 * that `speed` does not scale. `"linear"` adds no motion of its own, and
 * `"orbit"` circles the lattice cells' centers.
 *
 * `paletteIndices` is a color source and not a mask. Particles sample the
 * model's palette at those indices (empty = plain white). `randomHue`
 * shifts each particle's hue by a stable random amount within `hueRange`,
 * and `twinkle` fades particles in and out, through alpha with smooth
 * transparency and through the Bayer dither otherwise. For the `"pixel"`
 * shape, `size` is in output pixels. For the world-space shapes it is in
 * world units: the edge of a quad, cube or circle, the height of a
 * triangle, or the length of a `"line"` streak, which runs along the
 * velocity (down when there is none) one pixel thick.
 *
 * Particles are scenery. They keep the palette index of whatever they
 * cover and add their twinkle's coverage to the index buffer, so outlines
 * fade around them like around the model.
 */
export class ParticlesEffect implements SceneEffect {
	readonly id = "particles";
	readonly writesIndex = true;
	initialized = false;

	private program: twgl.ProgramInfo | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private emptyVao: WebGLVertexArrayObject | null = null;
	private readonly uniforms = {
		u_vp: null as mat4 | null,
		u_time: 0,
		u_cameraPos: [0, 0, 0] as Color3,
		u_areaSize: 1,
		u_lineDir: [0, -1, 0] as Color3,
		u_cameraRight: [1, 0, 0] as Color3,
		u_cameraUp: [0, 1, 0] as Color3,
		u_resolution: [1, 1] as [number, number],
		u_shape: 0,
		u_size: 1,
		u_sizeJitter: 0,
		u_motion: 0,
		u_speed: 1,
		u_velocity: [0, 0, 0] as Color3,
		u_twinkle: 0,
		u_hueRange: 0,
		u_paletteBlend: 0,
		u_paletteTexture: null as WebGLTexture | null,
		u_paletteIndices: new Float32Array(16),
		u_paletteCount: 0,
		u_smoothTransparency: false,
	};

	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, PARTICLES_DEFAULTS);
	}

	/**
	 * Compiles the particle shader program.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	init(gl: WebGL2RenderingContext): void {
		if (this.initialized) return;
		this.gl = gl;
		this.program = twgl.createProgramInfo(gl, [particlesVert, particlesFrag]);
		this.emptyVao = gl.createVertexArray();
		this.initialized = true;
	}

	/**
	 * Draws all particles with a single instanced draw call.
	 *
	 * @param ctx - The rendering context info.
	 * @param vpMatrix - The view-projection matrix.
	 * @param resources - The GPU resources for the current model.
	 */
	render(ctx: EffectContext, vpMatrix: mat4, resources: ModelResources): void {
		const gl = ctx.gl;
		const count = Math.min(Math.max(Math.round(this.count), 0), MAX_PARTICLES);
		if (count === 0) return;

		gl.useProgram(this.program!.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(false);
		gl.disable(gl.CULL_FACE);

		// Twinkle fades particles through alpha. The shader outputs
		// premultiplied color, so this blend composites correctly over
		// both the opaque scene and the premultiplied transparent chain.
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

		const u = this.uniforms;
		const b = resources.bounds;
		const extent = Math.max(
			b.max[0] - b.min[0],
			b.max[1] - b.min[1],
			b.max[2] - b.min[2],
			1e-3,
		);
		u.u_areaSize = Math.max(extent * this.areaScale, 1e-3);
		u.u_cameraPos = ctx.cameraPos;

		// Streaks run along the velocity, or fall straight down without one.
		const [vx, vy, vz] = this.velocity;
		const speed = Math.hypot(vx, vy, vz);
		if (speed > 1e-6) {
			u.u_lineDir[0] = vx / speed;
			u.u_lineDir[1] = vy / speed;
			u.u_lineDir[2] = vz / speed;
		} else {
			u.u_lineDir[0] = 0;
			u.u_lineDir[1] = -1;
			u.u_lineDir[2] = 0;
		}

		u.u_vp = vpMatrix;
		u.u_time = ctx.time;
		u.u_cameraRight = ctx.cameraRight;
		u.u_cameraUp = ctx.cameraUp;
		u.u_resolution[0] = ctx.width;
		u.u_resolution[1] = ctx.height;
		u.u_shape = SHAPE_INDEX[this.shape] ?? 0;
		u.u_size = this.size;
		u.u_sizeJitter = Math.min(Math.max(this.sizeJitter, 0), 1);
		u.u_motion = MOTION_INDEX[this.motion] ?? 0;
		u.u_speed = this.speed;
		for (let axis = 0; axis < 3; axis++) {
			u.u_velocity[axis] = this.velocity[axis] ?? 0;
		}
		u.u_twinkle = Math.min(Math.max(this.twinkle, 0), 1);
		u.u_hueRange = this.randomHue ? Math.max(this.hueRange, 0) * Math.PI : 0;
		u.u_paletteBlend = ctx.paletteBlend;
		u.u_smoothTransparency = ctx.transparency === "smooth";
		u.u_paletteTexture = resources.paletteTexture;
		u.u_paletteCount = Math.min(this.paletteIndices.length, 16);
		for (let i = 0; i < u.u_paletteCount; i++) {
			u.u_paletteIndices[i] = this.paletteIndices[i];
		}
		twgl.setUniforms(this.program!, u);

		const verts = SHAPE_VERTICES[this.shape] ?? 6;
		gl.bindVertexArray(this.emptyVao);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, verts, count);
		gl.bindVertexArray(null);

		ctx.stats.drawCalls++;
		ctx.stats.polyCount += (verts / 3) * count;

		gl.disable(gl.BLEND);
		gl.depthMask(true);
		gl.disable(gl.DEPTH_TEST);
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

export interface ParticlesEffect extends Required<ParticlesOptions> {}

/** Default settings for {@link ParticlesEffect}. */
export const PARTICLES_DEFAULTS = deepFreeze<DeepRequired<ParticlesOptions>>({
	enabled: false,
	count: 1000,
	shape: "pixel",
	paletteIndices: [],
	size: 2,
	sizeJitter: 0.5,
	motion: "drift",
	speed: 1,
	velocity: [0, 0, 0],
	areaScale: 8,
	twinkle: 0.3,
	randomHue: false,
	hueRange: 0.5,
});
