import { mat4, vec3 } from "gl-matrix";
import * as twgl from "twgl.js";
import type { OrbitCamera } from "../camera/orbit-camera.ts";
import {
	computeWorldBounds,
	traverseNode,
	updateRenderState,
	type WorldBounds,
} from "../scene/scene-graph.ts";
import type { Color3, PicoCAD2Model, SceneNode } from "../types/scene.ts";
import {
	buildAllBuffers,
	type NodeBuffers,
	updateNodeTexCoords,
} from "./buffers.ts";
import type { BillboardEffect } from "./effects/billboard-effect.ts";
import { packColorMask } from "./effects/color-mask.ts";
import type { DissolveEffect } from "./effects/dissolve-effect.ts";
import type { EmissionEffect } from "./effects/emission-effect.ts";
import type { FurEffect } from "./effects/fur-effect.ts";
import type { GlitterEffect } from "./effects/glitter-effect.ts";
import type { GradientLightEffect } from "./effects/gradient-light-effect.ts";
import { GradientOutlineEffect } from "./effects/gradient-outline-effect.ts";
import {
	INTERIOR_PATTERN_ID,
	type InteriorEffect,
} from "./effects/interior-effect.ts";
import { writeStyledColor } from "./effects/material-style.ts";
import {
	type MeshDeformEffect,
	writeMeshDeformUniforms,
} from "./effects/mesh-deform-effect.ts";
import type { PaletteSwapEffect } from "./effects/palette-swap-effect.ts";
import type { PostProcessPipeline } from "./effects/pipeline.ts";
import type { RimLightEffect } from "./effects/rim-light-effect.ts";
import type { SpecularEffect } from "./effects/specular-effect.ts";
import type { TriangleFlashEffect } from "./effects/triangle-flash-effect.ts";
import type { TriangleShatterEffect } from "./effects/triangle-shatter-effect.ts";
import type { EffectContext } from "./effects/types.ts";
import { createPrograms, type ShaderPrograms } from "./programs.ts";
import {
	buildPaletteData,
	createIndexTexture,
	createPaletteTexture,
	updatePaletteTexture,
} from "./textures.ts";

export interface RenderSettings {
	shading: boolean;
	renderMode: number;
	outlineSize: number;
	outlineColor: Color3;
	backgroundColor: Color3 | null;
	cutoutMask: number;
	dissolve: DissolveEffect | null;
	emission: EmissionEffect | null;
	interior: InteriorEffect | null;
	rimLight: RimLightEffect | null;
	gradientLight: GradientLightEffect | null;
	specular: SpecularEffect | null;
	glitter: GlitterEffect | null;
	meshDeform: MeshDeformEffect | null;
	triangleFlash: TriangleFlashEffect | null;
	triangleShatter: TriangleShatterEffect | null;
	paletteSwap: PaletteSwapEffect | null;
	fur: FurEffect | null;
	billboard: BillboardEffect | null;
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
	bounds: WorldBounds;
	paletteKey: string;
}

export interface RenderStats {
	drawCalls: number;
	polyCount: number;
}

/** The main WebGL renderer for PicoCAD 2 models. */
export class Renderer {
	readonly gl: WebGL2RenderingContext;
	readonly stats: RenderStats = { drawCalls: 0, polyCount: 0 };
	private readonly lightDirWorld: vec3 = vec3.create();
	private programs: ShaderPrograms;
	private emptyVao: WebGLVertexArrayObject | null = null;
	private readonly effectCtx: EffectContext;
	private shatterActive = false;
	private readonly nodeUniforms = {
		u_worldMatrix: mat4.create() as mat4,
	};
	private readonly modelUniforms = {
		u_vp: mat4.create() as mat4,
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

		u_deformEnabled: false,
		u_deformRound: 0,
		u_deformRoundGrid: 0.25,
		u_deformBarrel: 0,
		u_deformBarrelAxis: 1,
		u_deformSpherify: 0,
		u_deformTwist: 0,
		u_deformTwistAxis: 1,
		u_deformTwistPhase: 0,
		u_deformCenter: [0, 0, 0] as Color3,
		u_deformHalfExt: [1, 1, 1] as Color3,

		u_shatterEnabled: false,
		u_shatterProgress: 0,
		u_shatterMode: 0,
		u_shatterDirection: [0, 1, 0] as Color3,
		u_shatterDistance: 0,
		u_shatterSpread: 0,
		u_shatterRotation: 0,
		u_shatterGravity: 0,
		u_shatterShrink: 0,
		u_shatterMask: 0,

		u_flashEnabled: false,
		u_flashRate: 0,
		u_flashDensity: 0,
		u_flashDuration: 0,
		u_flashSoftness: 0,
		u_flashColor: [1, 1, 1] as Color3,
		u_flashMode: 0,
		u_flashSmooth: false,
		u_flashMask: 0,

		u_interiorEnabled: false,
		u_interiorPattern: 0,
		u_interiorDepth: 0,
		u_interiorLayers: 1,
		u_interiorScale: 1,
		u_interiorSpeed: 0,
		u_interiorColor: [1, 1, 1] as Color3,
		u_interiorBgColor: [0, 0, 0] as Color3,
		u_interiorSmooth: false,
		u_interiorMask: 0,

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

		u_dissolveEnabled: false,
		u_dissolveProgress: 0,
		u_dissolveMode: 0,
		u_dissolveScale: 8,
		u_dissolveAxis: [0, 1, 0] as Color3,
		u_dissolveAxisOffset: 0,
		u_dissolvePoint: [0, 0, 0] as Color3,
		u_dissolveInvRange: 1,
		u_dissolveRangeBias: 0,
		u_dissolveFlipScale: 1,
		u_dissolveFlipOffset: 0,
		u_dissolveSoftness: 0.15,
		u_dissolveEdgeWidth: 0,
		u_dissolveEdgeColor: [1, 1, 1] as Color3,
		u_dissolveSmooth: false,
		u_dissolveMask: 0,

		u_emissionEnabled: false,
		u_emissionStrength: 0,
		u_emissionBlinkMode: 0,
		u_emissionBlinkRate: 0,
		u_emissionBlinkMin: 0,
		u_emissionScrollDir: [0, 1, 0] as Color3,
		u_emissionScrollWidth: 0.25,
		u_emissionScrollGap: 0,
		u_emissionScrollSpeed: 0,
		u_emissionSmooth: false,
		u_emissionMask: 0,
	};
	private readonly furUniforms = {
		u_vp: mat4.create() as mat4,
		u_indexTexture: null as WebGLTexture | null,
		u_paletteTexture: null as WebGLTexture | null,
		u_lightDir: this.lightDirWorld,
		u_ambient: AMBIENT,
		u_transparentColor: 0,
		u_shadingEnabled: true,
		u_renderMode: 0,
		u_cutoutMask: 0,

		u_furLength: 0,
		u_furLayers: 1,
		u_furGravity: [0, 0, 0] as Color3,
		u_furDensity: 1,
		u_furRootShade: 0,
		u_furMask: 0,

		u_dissolveEnabled: false,
		u_dissolveProgress: 0,
		u_dissolveMode: 0,
		u_dissolveScale: 8,
		u_dissolveAxis: [0, 1, 0] as Color3,
		u_dissolveAxisOffset: 0,
		u_dissolvePoint: [0, 0, 0] as Color3,
		u_dissolveInvRange: 1,
		u_dissolveRangeBias: 0,
		u_dissolveFlipScale: 1,
		u_dissolveFlipOffset: 0,
		u_dissolveSoftness: 0.15,
		u_dissolveEdgeWidth: 0,
		u_dissolveEdgeColor: [1, 1, 1] as Color3,
		u_dissolveSmooth: false,
		u_dissolveMask: 0,

		u_deformEnabled: false,
		u_deformRound: 0,
		u_deformRoundGrid: 0.25,
		u_deformBarrel: 0,
		u_deformBarrelAxis: 1,
		u_deformSpherify: 0,
		u_deformTwist: 0,
		u_deformTwistAxis: 1,
		u_deformTwistPhase: 0,
		u_deformCenter: [0, 0, 0] as Color3,
		u_deformHalfExt: [1, 1, 1] as Color3,
	};
	/** Camera-facing rotation basis for the billboard effect, as columns. */
	private readonly billboardBasis = new Float32Array(9);
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
			stats: this.stats,
			depthTexture: null,
			indexTexture: null,
			paletteTexture: null,
			projectionMatrix: mat4.create(),
			invProjectionMatrix: mat4.create(),
			backgroundColor: [0, 0, 0],
			isOrthographic: false,
			bgIsTransparent: false,
			cameraFwd: [0, 0, -1],
			cameraRight: [1, 0, 0],
			cameraUp: [0, 1, 0],
			cameraAzimuth: 0,
			cameraElevation: 0,
			meshDeform: null,
			shatterActive: false,
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
			paletteKey: "",
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
		mat4.copy(mu.u_vp, vpMatrix);

		const shatter = settings.triangleShatter;
		this.shatterActive =
			(shatter?.enabled ?? false) && (shatter?.progress ?? 0) > 0;

		updateRenderState(model.root);
		this.applyBillboard(settings, model.root, v);
		this.updatePaletteSwap(settings, model, resources, time);

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
		ctx.paletteTexture = resources.paletteTexture;
		mat4.copy(ctx.projectionMatrix, camera.getProjectionMatrix(aspect));
		mat4.invert(ctx.invProjectionMatrix, ctx.projectionMatrix);
		ctx.meshDeform = settings.meshDeform;
		ctx.shatterActive = this.shatterActive;
		ctx.cameraFwd[0] = mu.u_cameraFwd[0];
		ctx.cameraFwd[1] = mu.u_cameraFwd[1];
		ctx.cameraFwd[2] = mu.u_cameraFwd[2];
		ctx.cameraRight[0] = mu.u_cameraRight[0];
		ctx.cameraRight[1] = mu.u_cameraRight[1];
		ctx.cameraRight[2] = mu.u_cameraRight[2];
		ctx.cameraUp[0] = v[1];
		ctx.cameraUp[1] = v[5];
		ctx.cameraUp[2] = v[9];
		ctx.cameraAzimuth = camera.omega + camera.omegaOffset;
		ctx.cameraElevation = camera.theta;

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
			this.drawModel(settings, model, resources);
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
			pipeline.blit(
				gl,
				x,
				y,
				w,
				h,
				ctx.backgroundColor,
				bgIsTransparent,
				this.stats,
			);
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
		gl.deleteProgram(this.programs.fur.program);

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

		this.stats.drawCalls++;
	}

	/**
	 * Draws the model with the textured/colored shader.
	 * The view-projection matrix is already uploaded as u_vp by {@link draw}.
	 *
	 * @param settings - The current render settings.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources.
	 */
	private drawModel(
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
		this.updateGeometryUniforms(settings, model, resources);
		twgl.setUniforms(this.programs.model, uniforms);

		const fur = settings.fur;
		const furLayers =
			fur?.enabled && !this.shatterActive && fur.length > 0
				? Math.min(Math.max(Math.round(fur.layers), 1), 16)
				: 0;
		if (furLayers > 0 && fur) {
			this.updateFurUniforms(fur, settings, resources, furLayers);
		}

		// Draw priority faces
		this.drawGroups(PRIORITY_GROUPS, resources);
		if (furLayers > 0) this.drawFur(PRIORITY_GROUPS, resources, furLayers);

		// Clear depth buffer
		gl.clear(gl.DEPTH_BUFFER_BIT);

		// Draw non-priority faces
		this.drawGroups(NON_PRIORITY_GROUPS, resources);
		if (furLayers > 0) this.drawFur(NON_PRIORITY_GROUPS, resources, furLayers);

		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
	}

	/**
	 * Applies the palette swap / color cycling effect by rewriting the model's
	 * palette LUT on the CPU when its effective remap changes. Restores the
	 * original palette when the effect turns off.
	 *
	 * @param settings - The current render settings.
	 * @param model - The parsed model, for its texture data.
	 * @param resources - The GPU resources holding the palette texture.
	 * @param time - Elapsed time in seconds, driving the color cycle.
	 */
	private updatePaletteSwap(
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
		time: number,
	): void {
		const swap = settings.paletteSwap;

		if (!swap?.enabled) {
			if (resources.paletteKey !== "") {
				updatePaletteTexture(
					this.gl,
					resources.paletteTexture,
					buildPaletteData(model.texture),
				);
				resources.paletteKey = "";
			}
			return;
		}

		const remap = swap.resolveRemap(time);
		const key = remap.join(",");
		if (key === resources.paletteKey) return;

		updatePaletteTexture(
			this.gl,
			resources.paletteTexture,
			buildPaletteData(model.texture, remap),
		);
		resources.paletteKey = key;
	}

	/**
	 * Maps the material effect settings (dissolve, emission, interior, rim
	 * light, gradient light, specular, glitter) onto the model shader's
	 * uniforms. Palette-style effect colors
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

		const interior = settings.interior;
		u.u_interiorEnabled = interior?.enabled ?? false;
		if (interior?.enabled) {
			writeStyledColor(
				u.u_interiorColor,
				interior.color,
				interior.style,
				palette,
			);
			writeStyledColor(
				u.u_interiorBgColor,
				interior.backgroundColor,
				interior.style,
				palette,
			);
			u.u_interiorPattern = INTERIOR_PATTERN_ID[interior.pattern] ?? 0;
			u.u_interiorDepth = Math.max(interior.depth, 0);
			u.u_interiorLayers = Math.min(
				Math.max(Math.round(interior.layers), 1),
				4,
			);
			u.u_interiorScale = interior.scale;
			u.u_interiorSpeed = interior.speed;
			u.u_interiorSmooth = interior.style === "smooth";
			u.u_interiorMask = packColorMask(interior.maskedColors);
		}

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

		const dissolve = settings.dissolve;
		const dissolveOn = dissolve
			? dissolve.enabled && dissolve.progress > 0
			: false;
		u.u_dissolveEnabled = dissolveOn;
		if (dissolve && dissolveOn) {
			const b = resources.bounds;
			const cx = (b.min[0] + b.max[0]) / 2;
			const cy = (b.min[1] + b.max[1]) / 2;
			const cz = (b.min[2] + b.max[2]) / 2;
			const hx = Math.max((b.max[0] - b.min[0]) / 2, 0);
			const hy = Math.max((b.max[1] - b.min[1]) / 2, 0);
			const hz = Math.max((b.max[2] - b.min[2]) / 2, 0);

			u.u_dissolveProgress = Math.min(Math.max(dissolve.progress, 0), 1);
			u.u_dissolveScale = Math.max(dissolve.scale, 0.01);
			u.u_dissolveSoftness = Math.max(dissolve.softness, 0);
			u.u_dissolveEdgeWidth = Math.max(dissolve.edgeWidth, 0);
			writeStyledColor(
				u.u_dissolveEdgeColor,
				dissolve.edgeColor,
				dissolve.style,
				palette,
			);
			u.u_dissolveSmooth = dissolve.style === "smooth";
			u.u_dissolveMask = packColorMask(dissolve.maskedColors);
			u.u_dissolveFlipScale = dissolve.invert ? -1 : 1;
			u.u_dissolveFlipOffset = dissolve.invert ? 1 : 0;

			if (dissolve.mode === "noise") {
				u.u_dissolveMode = 0;
			} else if (dissolve.mode === "directional") {
				// Remap the world-space sweep to 0-1 across the bounds'
				// projection onto the direction.
				u.u_dissolveMode = 1;
				let [dx, dy, dz] = dissolve.direction;
				const len = Math.hypot(dx, dy, dz);
				if (len < 1e-6) {
					dx = 0;
					dy = 1;
					dz = 0;
				} else {
					dx /= len;
					dy /= len;
					dz /= len;
				}
				const centerDot = dx * cx + dy * cy + dz * cz;
				const halfSpan =
					Math.abs(dx) * hx + Math.abs(dy) * hy + Math.abs(dz) * hz;
				const span = Math.max(halfSpan * 2, 1e-6);
				u.u_dissolveAxis[0] = dx / span;
				u.u_dissolveAxis[1] = dy / span;
				u.u_dissolveAxis[2] = dz / span;
				u.u_dissolveAxisOffset = -(centerDot - halfSpan) / span;
			} else {
				// Point and proximity share the distance form. The sweep is
				// the normalized distance to a world point (the camera for
				// proximity, refreshed every frame).
				u.u_dissolveMode = 2;
				let px: number;
				let py: number;
				let pz: number;
				let minDist = 0;
				let maxDist: number;
				if (dissolve.mode === "point") {
					[px, py, pz] = dissolve.point;
					let maxSq = 0;
					for (let corner = 0; corner < 8; corner++) {
						const ex = (corner & 1 ? b.max : b.min)[0] - px;
						const ey = (corner & 2 ? b.max : b.min)[1] - py;
						const ez = (corner & 4 ? b.max : b.min)[2] - pz;
						maxSq = Math.max(maxSq, ex * ex + ey * ey + ez * ez);
					}
					maxDist = Math.sqrt(maxSq);
				} else {
					px = u.u_cameraPos[0];
					py = u.u_cameraPos[1];
					pz = u.u_cameraPos[2];
					const r = Math.hypot(hx, hy, hz);
					const c = Math.hypot(px - cx, py - cy, pz - cz);
					minDist = Math.max(c - r, 0);
					maxDist = c + r;
				}
				const range = Math.max(maxDist - minDist, 1e-6);
				u.u_dissolvePoint[0] = px;
				u.u_dissolvePoint[1] = py;
				u.u_dissolvePoint[2] = pz;
				u.u_dissolveInvRange = 1 / range;
				u.u_dissolveRangeBias = -minDist / range;
			}
		}

		const emission = settings.emission;
		u.u_emissionEnabled = emission?.enabled ?? false;
		if (emission?.enabled) {
			u.u_emissionStrength = Math.min(Math.max(emission.strength, 0), 1);
			u.u_emissionBlinkMode = emission.blinkMode === "smooth" ? 0 : 1;
			u.u_emissionBlinkRate = Math.max(emission.blinkRate, 0);
			u.u_emissionBlinkMin = Math.min(Math.max(emission.blinkMin, 0), 1);
			let [sx, sy, sz] = emission.scrollDirection;
			const slen = Math.hypot(sx, sy, sz);
			if (slen < 1e-6) {
				sx = 0;
				sy = 1;
				sz = 0;
			} else {
				sx /= slen;
				sy /= slen;
				sz /= slen;
			}
			u.u_emissionScrollDir[0] = sx;
			u.u_emissionScrollDir[1] = sy;
			u.u_emissionScrollDir[2] = sz;
			u.u_emissionScrollWidth = Math.max(emission.scrollWidth, 0.001);
			u.u_emissionScrollGap = Math.max(emission.scrollGap, 0);
			u.u_emissionScrollSpeed = emission.scrollSpeed;
			u.u_emissionSmooth = emission.style === "smooth";
			u.u_emissionMask = packColorMask(emission.maskedColors);
		}
	}

	/**
	 * Maps the geometry effect settings (mesh deform, triangle flash,
	 * triangle shatter) onto the model shader's vertex-stage uniforms.
	 * Flash and shatter masks select by face color, deform is unmaskable.
	 *
	 * @param settings - The current render settings.
	 * @param model - The parsed model, for its palette.
	 * @param resources - The GPU resources, for the model bounds.
	 */
	private updateGeometryUniforms(
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const u = this.modelUniforms;
		const palette = model.texture.colors;

		writeMeshDeformUniforms(u, settings.meshDeform, resources.bounds, u.u_time);

		const shatter = settings.triangleShatter;
		u.u_shatterEnabled = shatter?.enabled ?? false;
		if (shatter?.enabled) {
			u.u_shatterProgress = Math.min(Math.max(shatter.progress, 0), 1);
			u.u_shatterMode =
				shatter.mode === "normal" ? 0 : shatter.mode === "radial" ? 1 : 2;

			const d = shatter.direction;
			const len = Math.hypot(d[0], d[1], d[2]);

			if (len > 1e-6) {
				u.u_shatterDirection[0] = d[0] / len;
				u.u_shatterDirection[1] = d[1] / len;
				u.u_shatterDirection[2] = d[2] / len;
			} else {
				u.u_shatterDirection[0] = 0;
				u.u_shatterDirection[1] = 1;
				u.u_shatterDirection[2] = 0;
			}

			u.u_shatterDistance = shatter.distance;
			u.u_shatterSpread = Math.max(shatter.spread, 0);
			u.u_shatterRotation = shatter.rotation;
			u.u_shatterGravity = shatter.gravity;
			u.u_shatterShrink = Math.min(Math.max(shatter.shrink, 0), 1);
			u.u_shatterMask = packColorMask(shatter.maskedColors);
		}

		const flash = settings.triangleFlash;
		u.u_flashEnabled = flash?.enabled ?? false;

		if (flash?.enabled) {
			writeStyledColor(u.u_flashColor, flash.color, flash.style, palette);

			u.u_flashRate = Math.max(flash.rate, 0);
			u.u_flashDensity = Math.min(Math.max(flash.density, 0), 1);
			u.u_flashDuration = Math.max(flash.duration, 0.001);
			u.u_flashSoftness = Math.min(Math.max(flash.softness, 0), 1);
			u.u_flashMode = flash.mode === "replace" ? 0 : 1;
			u.u_flashSmooth = flash.style === "smooth";
			u.u_flashMask = packColorMask(flash.maskedColors);
		}
	}

	/**
	 * Draws specific render groups across all node buffers.
	 * Model-wide uniforms must already be uploaded by {@link drawModel};
	 * this only sets the per-node matrices.
	 *
	 * @param groupIndices - Which render groups to draw.
	 * @param resources - The GPU resources.
	 */
	private drawGroups(
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

			this.nodeUniforms.u_worldMatrix = nb.node.worldMatrix;

			for (const groupIdx of groupIndices) {
				const group = nb.groups[groupIdx];
				if (!group) continue;

				const isDoubleSided = (groupIdx & 1) !== 0 || this.shatterActive;
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

	/**
	 * Maps the fur settings onto the fur program's uniforms. The shared
	 * model-state uniforms are copied from the already-updated model
	 * uniforms so the two programs always agree.
	 *
	 * @param fur - The enabled fur settings.
	 * @param settings - The current render settings, for the mesh deform.
	 * @param resources - The GPU resources, for textures and bounds.
	 * @param layers - The clamped shell count.
	 */
	private updateFurUniforms(
		fur: FurEffect,
		settings: RenderSettings,
		resources: ModelResources,
		layers: number,
	): void {
		const mu = this.modelUniforms;
		const u = this.furUniforms;

		mat4.copy(u.u_vp, mu.u_vp);
		u.u_indexTexture = mu.u_indexTexture;
		u.u_paletteTexture = mu.u_paletteTexture;
		u.u_transparentColor = mu.u_transparentColor;
		u.u_shadingEnabled = mu.u_shadingEnabled;
		u.u_renderMode = mu.u_renderMode;
		u.u_cutoutMask = mu.u_cutoutMask;

		u.u_furLength = fur.length;
		u.u_furLayers = layers;
		u.u_furGravity[0] = fur.gravity[0];
		u.u_furGravity[1] = fur.gravity[1];
		u.u_furGravity[2] = fur.gravity[2];
		u.u_furDensity = Math.max(fur.density, 0.01);
		u.u_furRootShade = Math.min(Math.max(fur.rootShade, 0), 1);
		u.u_furMask = packColorMask(fur.maskedColors);

		// Fur follows the model's dissolve, so the shells reuse the already
		// resolved model uniforms verbatim (the vec3s share references).
		u.u_dissolveEnabled = mu.u_dissolveEnabled;
		u.u_dissolveProgress = mu.u_dissolveProgress;
		u.u_dissolveMode = mu.u_dissolveMode;
		u.u_dissolveScale = mu.u_dissolveScale;
		u.u_dissolveAxis = mu.u_dissolveAxis;
		u.u_dissolveAxisOffset = mu.u_dissolveAxisOffset;
		u.u_dissolvePoint = mu.u_dissolvePoint;
		u.u_dissolveInvRange = mu.u_dissolveInvRange;
		u.u_dissolveRangeBias = mu.u_dissolveRangeBias;
		u.u_dissolveFlipScale = mu.u_dissolveFlipScale;
		u.u_dissolveFlipOffset = mu.u_dissolveFlipOffset;
		u.u_dissolveSoftness = mu.u_dissolveSoftness;
		u.u_dissolveEdgeWidth = mu.u_dissolveEdgeWidth;
		u.u_dissolveEdgeColor = mu.u_dissolveEdgeColor;
		u.u_dissolveSmooth = mu.u_dissolveSmooth;
		u.u_dissolveMask = mu.u_dissolveMask;

		writeMeshDeformUniforms(
			u,
			settings.meshDeform,
			resources.bounds,
			mu.u_time,
		);
	}

	/**
	 * Draws the fur shells for specific render groups as one instanced
	 * draw per group (gl_InstanceID = shell index). Runs while the index
	 * attachment is still bound, so strands write their base palette index
	 * like the model does. Rebinds the model program afterwards.
	 *
	 * @param groupIndices - Which render groups to draw shells for.
	 * @param resources - The GPU resources.
	 * @param layers - The shell count per strand.
	 */
	private drawFur(
		groupIndices: readonly number[],
		resources: ModelResources,
		layers: number,
	): void {
		const gl = this.gl;
		const program = this.programs.fur;

		gl.useProgram(program.program);
		twgl.setUniforms(program, this.furUniforms);

		for (const nb of resources.nodeBuffers) {
			if (!nb.node.renderVisible || nb.node.ghost) continue;

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

				twgl.setBuffersAndAttributes(gl, program, group.bufferInfo);
				twgl.setUniforms(program, this.nodeUniforms);
				twgl.drawBufferInfo(
					gl,
					group.bufferInfo,
					gl.TRIANGLES,
					undefined,
					undefined,
					layers,
				);

				this.stats.drawCalls++;
				this.stats.polyCount +=
					((group.bufferInfo.numElements ?? 0) / 3) * layers;
			}
		}

		gl.useProgram(this.programs.model.program);
	}

	/**
	 * Applies the billboard effect. Replaces the rotation basis of the
	 * selected nodes' world matrices with a camera-facing one, keeping
	 * translation and scale. Runs right after the scene graph update, so
	 * billboard wins over animated rotation and children inherit the
	 * billboarded frame.
	 *
	 * @param settings - The current render settings.
	 * @param root - The scene graph root.
	 * @param view - The camera view matrix, for the camera basis.
	 */
	private applyBillboard(
		settings: RenderSettings,
		root: SceneNode,
		view: mat4,
	): void {
		const bb = settings.billboard;
		if (!bb?.enabled) return;

		const b = this.billboardBasis;
		b[0] = view[0];
		b[1] = view[4];
		b[2] = view[8];
		b[3] = view[1];
		b[4] = view[5];
		b[5] = view[9];
		b[6] = view[2];
		b[7] = view[6];
		b[8] = view[10];

		if (bb.mode === "yaw") {
			const len = Math.hypot(b[6], b[8]);
			if (len > 1e-5) {
				b[6] /= len;
				b[8] /= len;
			} else {
				b[6] = 0;
				b[8] = 1;
			}
			b[7] = 0;
			b[3] = 0;
			b[4] = 1;
			b[5] = 0;
			b[0] = b[8];
			b[1] = 0;
			b[2] = -b[6];
		}

		if (bb.nodes.length > 0) {
			const names = new Set(bb.nodes);
			traverseNode(root, (node) => {
				if (names.has(node.name)) this.billboardNode(node);
			});
		} else {
			for (const node of root.children) {
				if (node.mesh) this.billboardNode(node);
			}
		}
	}

	/**
	 * Replaces one node's world rotation with the prepared camera-facing
	 * basis and recomputes its descendants' world matrices from it.
	 *
	 * @param node - The node to billboard.
	 */
	private billboardNode(node: SceneNode): void {
		if (!node.renderVisible) return;

		const b = this.billboardBasis;
		const w = node.worldMatrix;
		const sx = Math.hypot(w[0], w[1], w[2]);
		const sy = Math.hypot(w[4], w[5], w[6]);
		const sz = Math.hypot(w[8], w[9], w[10]);

		w[0] = b[0] * sx;
		w[1] = b[1] * sx;
		w[2] = b[2] * sx;
		w[4] = b[3] * sy;
		w[5] = b[4] * sy;
		w[6] = b[5] * sy;
		w[8] = b[6] * sz;
		w[9] = b[7] * sz;
		w[10] = b[8] * sz;

		node.dirty = true;
		this.refreshDescendants(node);
	}

	/**
	 * Recomputes the world matrices of a node's visible descendants after
	 * its own world matrix was replaced.
	 *
	 * @param node - The node whose subtree to refresh.
	 */
	private refreshDescendants(node: SceneNode): void {
		for (const child of node.children) {
			if (!child.renderVisible) continue;
			mat4.multiply(child.worldMatrix, node.worldMatrix, child.localMatrix);
			this.refreshDescendants(child);
		}
	}
}
