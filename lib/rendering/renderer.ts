import { mat4, vec3 } from "gl-matrix";
import * as twgl from "twgl.js";
import type { OrbitCamera } from "../camera/orbit-camera.ts";
import {
	computeWorldBounds,
	updateRenderState,
	type WorldBounds,
} from "../scene/scene-graph.ts";
import type { Color3, PicoCAD2Model } from "../types/scene.ts";
import {
	buildAllBuffers,
	type NodeBuffers,
	updateNodeTexCoords,
} from "./buffers.ts";
import { packColorMask } from "./effects/color-mask.ts";
import type { GlitterEffect } from "./effects/glitter-effect.ts";
import type { GradientLightEffect } from "./effects/gradient-light-effect.ts";
import { GradientOutlineEffect } from "./effects/gradient-outline-effect.ts";
import { writeStyledColor } from "./effects/material-style.ts";
import type { PostProcessPipeline } from "./effects/pipeline.ts";
import type { RimLightEffect } from "./effects/rim-light-effect.ts";
import type { SpecularEffect } from "./effects/specular-effect.ts";
import type { EffectContext } from "./effects/types.ts";
import { createPrograms, type ShaderPrograms } from "./programs.ts";
import { createIndexTexture, createPaletteTexture } from "./textures.ts";

export interface RenderSettings {
	shading: boolean;
	renderMode: number;
	outlineSize: number;
	outlineColor: Color3;
	backgroundColor: Color3 | null;
	cutoutMask: number;
	rimLight: RimLightEffect | null;
	gradientLight: GradientLightEffect | null;
	specular: SpecularEffect | null;
	glitter: GlitterEffect | null;
}

/**
 * Light direction in view space, matching PicoCAD 2's {0, -0.3, 1}.
 * Z is negated because gl-matrix's lookAt has z pointing away from the scene,
 * while PicoCAD 2's lookAt has z pointing into the scene.
 */
const LIGHT_DIR_VIEW = vec3.normalize(
	vec3.create(),
	vec3.fromValues(0, -0.3, -1),
);

/** Ambient light level matching PicoCAD 2. */
const AMBIENT = 0.15;

/** Render groups drawn first, into a depth buffer that is cleared afterwards. */
const PRIORITY_GROUPS = [2, 3] as const;

/** Render groups drawn after the depth clear. */
const NON_PRIORITY_GROUPS = [0, 1] as const;

export interface ModelResources {
	indexTexture: WebGLTexture;
	paletteTexture: WebGLTexture;
	nodeBuffers: NodeBuffers[];
	/** World-space bounds of the rest pose, for effects that need a model frame. */
	bounds: WorldBounds;
}

export interface RenderStats {
	drawCalls: number;
	polyCount: number;
}

/** The main WebGL renderer for PicoCAD 2 models. */
export class Renderer {
	readonly gl: WebGL2RenderingContext;
	readonly stats: RenderStats = { drawCalls: 0, polyCount: 0 };
	private readonly mvpMatrix: mat4 = mat4.create();
	private readonly lightDirWorld: vec3 = vec3.create();
	private programs: ShaderPrograms;
	private emptyVao: WebGLVertexArrayObject | null = null;
	private readonly effectCtx: EffectContext;
	private readonly nodeUniforms = {
		u_mvp: this.mvpMatrix,
		u_worldMatrix: this.mvpMatrix as mat4,
	};
	private readonly modelUniforms = {
		u_indexTexture: null as WebGLTexture | null,
		u_paletteTexture: null as WebGLTexture | null,
		u_lightDir: this.lightDirWorld,
		u_ambient: AMBIENT,
		u_transparentColor: 0,
		u_shadingEnabled: true,
		u_renderMode: 0,
		u_cutoutMask: 0,

		u_cameraPos: [0, 0, 0] as Color3,
		u_cameraFwd: [0, 0, -1] as Color3,
		u_cameraRight: [1, 0, 0] as Color3,
		u_isOrtho: false,
		u_time: 0,
		u_resolution: [1, 1] as [number, number],
		u_viewportOrigin: [0, 0] as [number, number],
		u_boundsMinY: 0,
		u_boundsSpanY: 1,

		u_rimEnabled: false,
		u_rimColor: [1, 1, 1] as Color3,
		u_rimWidth: 0,
		u_rimSharpness: 0,
		u_rimLightAlign: 0,
		u_rimBlend: 0,
		u_rimInvert: false,
		u_rimSmooth: false,
		u_rimMask: 0,

		u_gradLightEnabled: false,
		u_gradLightLit: [1, 1, 1] as Color3,
		u_gradLightShadow: [0, 0, 0] as Color3,
		u_gradLightSource: 0,
		u_gradLightBlend: 0,
		u_gradLightSmooth: false,
		u_gradLightMask: 0,

		u_specEnabled: false,
		u_specColor: [1, 1, 1] as Color3,
		u_specStrength: 0,
		u_specSmoothness: 0,
		u_specAnisotropy: 0,
		u_envStrength: 0,
		u_envSky: [0, 0, 0] as Color3,
		u_envGround: [0, 0, 0] as Color3,
		u_envHorizon: 0.5,
		u_envFresnel: 0,
		u_specSmooth: false,
		u_specMask: 0,

		u_glitterEnabled: false,
		u_glitterColor: [1, 1, 1] as Color3,
		u_glitterSpace: 0,
		u_glitterDensity: 0,
		u_glitterSize: 0,
		u_glitterHueRange: 0,
		u_glitterBrightness: 0,
		u_glitterAngleCos: 0,
		u_glitterSpeed: 0,
		u_glitterShape: 0,
		u_glitterSmooth: false,
		u_glitterMask: 0,
	};
	private readonly outlineUniforms = {
		u_texture: null as WebGLTexture | null,
		u_outlineSize: 0,
		u_outlineColor: [0, 0, 0] as Color3,
		u_texelSize: [1, 1] as [number, number],
		u_backgroundColor: [0, 0, 0] as Color3,
		u_bgIsTransparent: false,
	};

	/**
	 * Creates a new renderer for the given WebGL 2 context.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.programs = createPrograms(gl);
		this.effectCtx = {
			gl,
			width: 0,
			height: 0,
			time: 0,
			depthTexture: null,
			indexTexture: null,
			backgroundColor: [0, 0, 0],
			isOrthographic: false,
			bgIsTransparent: false,
		};
	}

	/**
	 * Creates GPU resources for a parsed model.
	 *
	 * @param model - The parsed PicoCAD 2 model.
	 * @returns The GPU resources needed to render this model.
	 */
	createModelResources(model: PicoCAD2Model): ModelResources {
		updateRenderState(model.root);

		return {
			indexTexture: createIndexTexture(this.gl, model.texture),
			paletteTexture: createPaletteTexture(this.gl, model.texture),
			nodeBuffers: buildAllBuffers(this.gl, model.root),
			bounds: computeWorldBounds(model.root),
		};
	}

	/**
	 * Renders a single frame of the given model into a region of the canvas.
	 * Off-screen effect passes always run at `w × h`; only output to the
	 * default framebuffer is placed at `(x, y)` (GL bottom-left origin).
	 *
	 * @param camera - The orbit camera providing view/projection matrices.
	 * @param settings - The current render settings.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources for this model.
	 * @param time - Elapsed time in seconds for animated effects.
	 * @param pipeline - The per-viewer post-process pipeline.
	 * @param x - The output viewport x offset in the default framebuffer.
	 * @param y - The output viewport y offset in the default framebuffer.
	 * @param w - The render width in pixels.
	 * @param h - The render height in pixels.
	 */
	draw(
		camera: OrbitCamera,
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
		time: number,
		pipeline: PostProcessPipeline,
		x: number,
		y: number,
		w: number,
		h: number,
	): void {
		const gl = this.gl;

		const gradOutline = pipeline.getPostEffect("gradientOutline");
		const useGradientOutline =
			gradOutline instanceof GradientOutlineEffect && gradOutline.enabled;
		const useOutline = settings.outlineSize > 0 && !useGradientOutline;
		const hasEffects = pipeline.hasActiveEffects();
		const useFbo = useOutline || hasEffects;

		this.stats.drawCalls = 0;
		this.stats.polyCount = 0;

		const aspect = h / w;
		const vpMatrix = camera.getViewProjectionMatrix(aspect);

		// Compute world-space light direction from camera orientation.
		// The light is attached to the camera in PicoCAD 2 (view-space direction).
		// Transform from view space to world space using transpose of mat3(viewMatrix).
		const v = camera.getViewMatrix();
		const lx = LIGHT_DIR_VIEW[0];
		const ly = LIGHT_DIR_VIEW[1];
		const lz = LIGHT_DIR_VIEW[2];
		this.lightDirWorld[0] = v[0] * lx + v[1] * ly + v[2] * lz;
		this.lightDirWorld[1] = v[4] * lx + v[5] * ly + v[6] * lz;
		this.lightDirWorld[2] = v[8] * lx + v[9] * ly + v[10] * lz;

		// Camera world position and basis for the material effects, from the
		// view matrix V = [R|t]: position = -Rᵀt, right = Rᵀx̂, forward = -Rᵀẑ.
		const mu = this.modelUniforms;
		mu.u_cameraPos[0] = -(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]);
		mu.u_cameraPos[1] = -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]);
		mu.u_cameraPos[2] = -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14]);
		mu.u_cameraFwd[0] = -v[2];
		mu.u_cameraFwd[1] = -v[6];
		mu.u_cameraFwd[2] = -v[10];
		mu.u_cameraRight[0] = v[0];
		mu.u_cameraRight[1] = v[4];
		mu.u_cameraRight[2] = v[8];
		mu.u_isOrtho = camera.projectionMode === "orthographic";
		mu.u_time = time;
		mu.u_resolution[0] = w;
		mu.u_resolution[1] = h;

		mu.u_viewportOrigin[0] = useFbo ? 0 : x;
		mu.u_viewportOrigin[1] = useFbo ? 0 : y;

		updateRenderState(model.root);

		let bgR: number;
		let bgG: number;
		let bgB: number;
		if (settings.backgroundColor) {
			bgR = settings.backgroundColor[0];
			bgG = settings.backgroundColor[1];
			bgB = settings.backgroundColor[2];
		} else {
			const bgIdx = model.texture.backgroundColor;
			const colors = model.texture.colors;
			bgR = colors[bgIdx * 3] ?? 0;
			bgG = colors[bgIdx * 3 + 1] ?? 0;
			bgB = colors[bgIdx * 3 + 2] ?? 0;
		}

		const tcIdx = model.texture.transparentColor;
		const colors = model.texture.colors;
		const tcR = colors[tcIdx * 3] ?? 0;
		const tcG = colors[tcIdx * 3 + 1] ?? 0;
		const tcB = colors[tcIdx * 3 + 2] ?? 0;

		// Compare in float32 space so both source-precision values and values
		// from states saved by older versions match the transparent color.
		const bgIsTransparent =
			Math.fround(bgR) === tcR &&
			Math.fround(bgG) === tcG &&
			Math.fround(bgB) === tcB;

		if (useGradientOutline) {
			const goBg = (gradOutline as GradientOutlineEffect).backgroundColor;
			goBg[0] = bgR;
			goBg[1] = bgG;
			goBg[2] = bgB;
		}

		const ctx = this.effectCtx;
		ctx.width = w;
		ctx.height = h;
		ctx.time = time;
		ctx.bgIsTransparent = bgIsTransparent;
		ctx.backgroundColor[0] = bgR;
		ctx.backgroundColor[1] = bgG;
		ctx.backgroundColor[2] = bgB;
		ctx.isOrthographic = camera.projectionMode === "orthographic";

		if (useFbo) {
			pipeline.pool.ensure(gl, w, h);
			pipeline.pool.bindScene(gl);

			// With a transparent background the effect chain is premultiplied.
			// Uncovered pixels must be (0, 0, 0, 0) so their color contributes
			// nothing when effects resample or extend coverage.
			if (useOutline || useGradientOutline || bgIsTransparent) {
				gl.clearColor(0, 0, 0, 0);
			} else {
				gl.clearColor(bgR, bgG, bgB, 0);
			}

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			pipeline.pool.clearIndex(gl);
			gl.viewport(0, 0, w, h);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);

			// Clear to premultiplied black when transparent. Firefox composites the
			// canvas as premultiplied, so RGB behind alpha 0 would bleed additively.
			if (bgIsTransparent) {
				gl.clearColor(0, 0, 0, 0);
			} else {
				gl.clearColor(bgR, bgG, bgB, 1);
			}

			// The canvas may hold other viewers' regions this frame; scissor the
			// clear so only this viewer's rect is touched.
			gl.enable(gl.SCISSOR_TEST);
			gl.scissor(x, y, w, h);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.disable(gl.SCISSOR_TEST);
			gl.viewport(x, y, w, h);
		}

		if (settings.renderMode < 2) {
			this.drawModel(vpMatrix, settings, model, resources);
		}

		// Only the model shader writes the index attachment, later passes
		// (wireframe, outline, post effects) draw to the color buffer alone.
		if (useFbo) {
			pipeline.pool.disableIndexWrites(gl);
		}

		if (pipeline.hasActiveSceneEffects()) {
			ctx.depthTexture = pipeline.pool.getDepthTexture();
			ctx.indexTexture = pipeline.pool.getIndexTexture();
			for (const effect of pipeline.sceneEffects) {
				if (!effect.enabled) continue;
				if (!effect.initialized) {
					effect.init(gl);
				}
				effect.render(ctx, vpMatrix, resources);
			}
		}

		if (!useFbo) return;

		if (useOutline) {
			const inputTexture = pipeline.pool.swap(gl);
			gl.viewport(0, 0, w, h);
			this.drawOutline(
				w,
				h,
				inputTexture,
				settings,
				bgR,
				bgG,
				bgB,
				bgIsTransparent,
			);
		}

		if (pipeline.hasActivePostEffects()) {
			pipeline.pool.detachSceneTextures(gl);
			ctx.depthTexture = pipeline.pool.getDepthTexture();
			ctx.indexTexture = pipeline.pool.getIndexTexture();
			pipeline.execute(ctx, ctx.backgroundColor, bgIsTransparent, x, y);
		} else {
			pipeline.blit(gl, x, y, w, h, ctx.backgroundColor, bgIsTransparent);
		}
	}

	/**
	 * Frees GPU resources for a specific model.
	 *
	 * @param resources - The model resources to dispose.
	 */
	disposeModelResources(resources: ModelResources): void {
		const gl = this.gl;
		gl.deleteTexture(resources.indexTexture);
		gl.deleteTexture(resources.paletteTexture);
		resources.nodeBuffers = [];
	}

	/**
	 * Frees all GPU resources held by this renderer.
	 */
	dispose(): void {
		const gl = this.gl;
		gl.deleteProgram(this.programs.model.program);
		gl.deleteProgram(this.programs.outline.program);

		if (this.emptyVao) {
			gl.deleteVertexArray(this.emptyVao);
			this.emptyVao = null;
		}
	}

	/**
	 * Applies the outline post-process shader.
	 * Reads the input texture and draws to the currently bound framebuffer.
	 *
	 * @param w - The render width in pixels.
	 * @param h - The render height in pixels.
	 * @param inputTexture - The scene texture to detect outlines from.
	 * @param settings - The render settings containing outline parameters.
	 * @param bgR - Background red component (0-1).
	 * @param bgG - Background green component (0-1).
	 * @param bgB - Background blue component (0-1).
	 * @param bgIsTransparent - Whether the background renders as transparent.
	 */
	private drawOutline(
		w: number,
		h: number,
		inputTexture: WebGLTexture,
		settings: RenderSettings,
		bgR: number,
		bgG: number,
		bgB: number,
		bgIsTransparent: boolean,
	): void {
		const gl = this.gl;

		if (!this.emptyVao) {
			this.emptyVao = gl.createVertexArray();
		}

		gl.viewport(0, 0, w, h);
		gl.disable(gl.DEPTH_TEST);

		gl.useProgram(this.programs.outline.program);

		const uniforms = this.outlineUniforms;
		uniforms.u_texture = inputTexture;
		uniforms.u_outlineSize = settings.outlineSize;
		uniforms.u_outlineColor = settings.outlineColor;
		uniforms.u_texelSize[0] = 1 / w;
		uniforms.u_texelSize[1] = 1 / h;
		uniforms.u_backgroundColor[0] = bgR;
		uniforms.u_backgroundColor[1] = bgG;
		uniforms.u_backgroundColor[2] = bgB;
		uniforms.u_bgIsTransparent = bgIsTransparent;
		twgl.setUniforms(this.programs.outline, uniforms);

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}

	/**
	 * Draws the model with the textured/colored shader.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param settings - The current render settings.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources.
	 */
	private drawModel(
		vpMatrix: mat4,
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const gl = this.gl;

		gl.useProgram(this.programs.model.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);

		const uniforms = this.modelUniforms;
		uniforms.u_indexTexture = resources.indexTexture;
		uniforms.u_paletteTexture = resources.paletteTexture;
		uniforms.u_transparentColor = model.texture.transparentColor;
		uniforms.u_shadingEnabled = settings.shading;
		uniforms.u_renderMode = settings.renderMode;
		uniforms.u_cutoutMask = settings.cutoutMask;
		this.updateMaterialUniforms(settings, model, resources);
		twgl.setUniforms(this.programs.model, uniforms);

		// Draw priority faces
		this.drawGroups(vpMatrix, PRIORITY_GROUPS, resources);

		// Clear depth buffer
		gl.clear(gl.DEPTH_BUFFER_BIT);

		// Draw non-priority faces
		this.drawGroups(vpMatrix, NON_PRIORITY_GROUPS, resources);

		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
	}

	/**
	 * Maps the material effect settings (rim light, gradient light, specular,
	 * glitter) onto the model shader's uniforms. Palette-style effect colors
	 * are snapped to the nearest palette entry here, so the shader receives
	 * legal palette colors and models can swap palettes freely.
	 *
	 * @param settings - The current render settings.
	 * @param model - The parsed model, for its palette.
	 * @param resources - The GPU resources, for the model bounds.
	 */
	private updateMaterialUniforms(
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const u = this.modelUniforms;
		const palette = model.texture.colors;

		u.u_boundsMinY = resources.bounds.min[1];
		u.u_boundsSpanY = Math.max(
			resources.bounds.max[1] - resources.bounds.min[1],
			1e-6,
		);

		const rim = settings.rimLight;
		u.u_rimEnabled = rim?.enabled ?? false;
		if (rim?.enabled) {
			writeStyledColor(u.u_rimColor, rim.color, rim.style, palette);
			u.u_rimWidth = rim.width;
			u.u_rimSharpness = rim.sharpness;
			u.u_rimLightAlign = rim.lightAlign;
			u.u_rimBlend = rim.blend;
			u.u_rimInvert = rim.invert;
			u.u_rimSmooth = rim.style === "smooth";
			u.u_rimMask = packColorMask(rim.maskedColors);
		}

		const grad = settings.gradientLight;
		u.u_gradLightEnabled = grad?.enabled ?? false;
		if (grad?.enabled) {
			writeStyledColor(u.u_gradLightLit, grad.litColor, grad.style, palette);
			writeStyledColor(
				u.u_gradLightShadow,
				grad.shadowColor,
				grad.style,
				palette,
			);
			u.u_gradLightSource =
				grad.source === "light" ? 0 : grad.source === "worldY" ? 1 : 2;
			u.u_gradLightBlend = grad.blend;
			u.u_gradLightSmooth = grad.style === "smooth";
			u.u_gradLightMask = packColorMask(grad.maskedColors);
		}

		const spec = settings.specular;
		u.u_specEnabled = spec?.enabled ?? false;
		if (spec?.enabled) {
			const env = spec.environment;
			writeStyledColor(u.u_specColor, spec.color, spec.style, palette);
			writeStyledColor(u.u_envSky, env.skyColor, spec.style, palette);
			writeStyledColor(u.u_envGround, env.groundColor, spec.style, palette);
			u.u_specStrength = spec.strength;
			u.u_specSmoothness = spec.smoothness;
			// Capped below 1 so the flattened normal can't collapse to zero
			// length for faces pointing along the camera's right axis.
			u.u_specAnisotropy = Math.min(Math.max(spec.anisotropy, 0), 0.98);
			u.u_envStrength = env.strength;
			u.u_envHorizon = env.horizon;
			u.u_envFresnel = env.fresnel;
			u.u_specSmooth = spec.style === "smooth";
			u.u_specMask = packColorMask(spec.maskedColors);
		}

		const glitter = settings.glitter;
		u.u_glitterEnabled = glitter?.enabled ?? false;
		if (glitter?.enabled) {
			writeStyledColor(u.u_glitterColor, glitter.color, glitter.style, palette);
			u.u_glitterSpace =
				glitter.space === "uv" ? 0 : glitter.space === "screen" ? 1 : 2;
			u.u_glitterDensity = glitter.density;
			u.u_glitterSize = Math.min(Math.max(glitter.size, 0), 1);
			u.u_glitterHueRange = glitter.randomHue
				? Math.max(glitter.hueRange, 0) * Math.PI
				: 0;
			u.u_glitterBrightness = Math.max(glitter.brightness, 0);
			u.u_glitterAngleCos = Math.cos(
				(Math.min(Math.max(glitter.angleRange, 1), 90) * Math.PI) / 180,
			);
			u.u_glitterSpeed = glitter.speed;
			u.u_glitterShape = glitter.shape === "square" ? 0 : 1;
			u.u_glitterSmooth = glitter.style === "smooth";
			u.u_glitterMask = packColorMask(glitter.maskedColors);
		}
	}

	/**
	 * Draws specific render groups across all node buffers.
	 * Model-wide uniforms must already be uploaded by {@link drawModel};
	 * this only sets the per-node matrices.
	 *
	 * @param vpMatrix - The view-projection matrix.
	 * @param groupIndices - Which render groups to draw.
	 * @param resources - The GPU resources.
	 */
	private drawGroups(
		vpMatrix: mat4,
		groupIndices: readonly number[],
		resources: ModelResources,
	): void {
		const gl = this.gl;

		for (const nb of resources.nodeBuffers) {
			// Ghost ("editor only") meshes are hidden outside the editor,
			// but their nodes still drive child transforms.
			if (!nb.node.renderVisible || nb.node.ghost) continue;

			if (nb.node.uvsDirty) {
				updateNodeTexCoords(gl, nb);
				nb.node.uvsDirty = false;
			}

			mat4.multiply(this.mvpMatrix, vpMatrix, nb.node.worldMatrix);
			this.nodeUniforms.u_worldMatrix = nb.node.worldMatrix;

			for (const groupIdx of groupIndices) {
				const group = nb.groups[groupIdx];
				if (!group) continue;

				const isDoubleSided = (groupIdx & 1) !== 0;
				if (isDoubleSided) {
					gl.disable(gl.CULL_FACE);
				} else {
					gl.enable(gl.CULL_FACE);
					gl.cullFace(gl.FRONT);
				}

				twgl.setBuffersAndAttributes(gl, this.programs.model, group.bufferInfo);
				twgl.setUniforms(this.programs.model, this.nodeUniforms);
				twgl.drawBufferInfo(gl, group.bufferInfo);

				this.stats.drawCalls++;
				this.stats.polyCount += (group.bufferInfo.numElements ?? 0) / 3;
			}
		}
	}
}
