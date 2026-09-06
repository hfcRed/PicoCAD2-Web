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
	buildNodeBuffers,
	deleteNodeBuffers,
	type NodeBuffers,
	updateNodeTexCoords,
} from "./buffers.ts";
import type { BillboardEffect } from "./effects/billboard-effect.ts";
import type { ColorCutoutEffect } from "./effects/color-cutout-effect.ts";
import { packColorMask } from "./effects/color-mask.ts";
import { type CyclePhase, resolveCyclePhase } from "./effects/cycle.ts";
import type { DissolveEffect } from "./effects/dissolve-effect.ts";
import type { EmissionEffect } from "./effects/emission-effect.ts";
import {
	type FloorEffect,
	type FloorPlane,
	writeFloorLightVp,
	writeFloorMirror,
	writeFloorPlane,
} from "./effects/floor-effect.ts";
import type { FurEffect } from "./effects/fur-effect.ts";
import type { GlitterEffect } from "./effects/glitter-effect.ts";
import type { GradientLightEffect } from "./effects/gradient-light-effect.ts";
import { GradientOutlineEffect } from "./effects/gradient-outline-effect.ts";
import type { InteriorEffect } from "./effects/interior-effect.ts";
import {
	type TransparencyMode,
	writeStyledColor,
} from "./effects/material-style.ts";
import {
	createMeshDeformUniforms,
	type MeshDeformEffect,
	writeMeshDeformUniforms,
} from "./effects/mesh-deform-effect.ts";
import type { PaletteSwapEffect } from "./effects/palette-swap-effect.ts";
import { ParticlesEffect } from "./effects/particles-effect.ts";
import { PATTERN_ID } from "./effects/patterns.ts";
import type { PostProcessPipeline } from "./effects/pipeline.ts";
import {
	type ProjectionEffect,
	writeProjectionBasis,
} from "./effects/projection-effect.ts";
import type { RimLightEffect } from "./effects/rim-light-effect.ts";
import type { SpecularEffect } from "./effects/specular-effect.ts";
import {
	createSweepUniforms,
	sweepActive,
	sweepComplete,
	writeSweepUniforms,
} from "./effects/sweep.ts";
import type { TriangleFlashEffect } from "./effects/triangle-flash-effect.ts";
import type { TriangleShatterEffect } from "./effects/triangle-shatter-effect.ts";
import type { EffectContext } from "./effects/types.ts";
import {
	createVertexGlitchUniforms,
	type VertexGlitchEffect,
	writeVertexGlitchUniforms,
} from "./effects/vertex-glitch-effect.ts";
import { FloorResources } from "./floor-resources.ts";
import { computeNodeBits, NODE_BIT } from "./node-selection.ts";
import { createPrograms, type ShaderPrograms } from "./programs.ts";
import {
	buildPaletteData,
	createIndexTexture,
	createPaletteTexture,
	updatePaletteTexture,
} from "./textures.ts";
import { voxelizeModel } from "./voxelize.ts";

export interface RenderSettings {
	shading: boolean;
	renderMode: number;
	outlineSize: number;
	outlineColor: Color3;
	backgroundColor: Color3 | null;
	transparency: TransparencyMode;
	cutoutMask: number;
	colorCutout: ColorCutoutEffect | null;
	dissolve: DissolveEffect | null;
	emission: EmissionEffect | null;
	projection: ProjectionEffect | null;
	interior: InteriorEffect | null;
	rimLight: RimLightEffect | null;
	gradientLight: GradientLightEffect | null;
	specular: SpecularEffect | null;
	glitter: GlitterEffect | null;
	meshDeform: MeshDeformEffect | null;
	triangleFlash: TriangleFlashEffect | null;
	triangleShatter: TriangleShatterEffect | null;
	vertexGlitch: VertexGlitchEffect | null;
	paletteSwap: PaletteSwapEffect | null;
	fur: FurEffect | null;
	billboard: BillboardEffect | null;
	floor: FloorEffect | null;
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

/** A clip height no geometry is below, for passes without a floor clip. */
const NO_CLIP = -1e30;

/** Render groups drawn first, into a depth buffer that is cleared afterwards. */
const PRIORITY_GROUPS = [2, 3] as const;

/** Render groups drawn after the depth clear. */
const NON_PRIORITY_GROUPS = [0, 1] as const;

/** The model shaders' fade passes, matching `chunks/transparency.glsl`. */
const FADE_DITHERED = 0;
const FADE_OPAQUE = 1;
const FADE_BLENDED = 2;

export interface ModelResources {
	indexTexture: WebGLTexture;
	paletteTexture: WebGLTexture;
	nodeBuffers: NodeBuffers[];
	baseBuffers: NodeBuffers[];
	voxelBuffers: NodeBuffers[] | null;
	voxelActive: NodeBuffers[] | null;
	voxelDual: NodeBuffers[] | null;
	voxelKey: string;
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
	private readonly shatterPhase: CyclePhase = { progress: 0, returning: false };
	private readonly dissolvePhase: CyclePhase = {
		progress: 0,
		returning: false,
	};
	private readonly deformPhase: CyclePhase = { progress: 1, returning: false };
	private readonly glitchPhase: CyclePhase = { progress: 1, returning: false };
	private glitchActive = false;
	private furLayers = 0;
	private cullOff = false;
	private floor: FloorResources | null = null;
	private floorShadowOn = false;
	private floorShadowReach = 0;
	private floorReflectionOn = false;
	private readonly floorPlane: FloorPlane = { center: [0, 0, 0], half: 1 };
	private smoothFades = false;
	private fadePasses = false;
	private readonly fadePassUniforms = { u_fadePass: FADE_DITHERED };
	private readonly nodeUniforms = {
		u_worldMatrix: mat4.create() as mat4,
		u_nodeBits: 0,
		u_voxelSide: -1,
	};
	/** Per-node effect selection bits for the current frame. */
	private readonly nodeBits = new Map<SceneNode, number>();
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
		u_paletteBlend: 0,

		u_cameraPos: [0, 0, 0] as Color3,
		u_cameraFwd: [0, 0, -1] as Color3,
		u_cameraRight: [1, 0, 0] as Color3,
		u_isOrtho: false,
		u_time: 0,
		u_resolution: [1, 1] as [number, number],
		u_viewportOrigin: [0, 0] as [number, number],
		u_boundsMinY: 0,
		u_boundsSpanY: 1,
		u_clipBelowY: NO_CLIP,
		u_fadePass: FADE_DITHERED,

		...createMeshDeformUniforms(),

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
		u_shatterSweep: createSweepUniforms(),

		...createVertexGlitchUniforms(),

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
		u_interiorSeed: 0,
		u_interiorColor: [1, 1, 1] as Color3,
		u_interiorBgColor: [0, 0, 0] as Color3,
		u_interiorHueRange: 0,
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
		u_dissolveSweep: createSweepUniforms(),
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

		u_projectionEnabled: false,
		u_projectionPattern: 0,
		u_projectionMode: 0,
		u_projectionDir: [0, -1, 0] as Color3,
		u_projectionU: [1, 0, 0] as Color3,
		u_projectionV: [0, 0, 1] as Color3,
		u_projectionColor: [1, 1, 1] as Color3,
		u_projectionScale: 1,
		u_projectionSpeed: 0,
		u_projectionSeed: 0,
		u_projectionStrength: 0,
		u_projectionFacing: 0,
		u_projectionSmooth: false,
		u_projectionMask: 0,
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
		u_paletteBlend: 0,

		u_furLength: 0,
		u_furLayers: 1,
		u_furGravity: [0, 0, 0] as Color3,
		u_furDensity: 1,
		u_furRootShade: 0,
		u_furMask: 0,
		u_time: 0,
		u_clipBelowY: NO_CLIP,
		u_fadePass: FADE_DITHERED,

		...createVertexGlitchUniforms(),

		u_dissolveEnabled: false,
		u_dissolveProgress: 0,
		u_dissolveSweep: createSweepUniforms(),
		u_dissolveEdgeWidth: 0,
		u_dissolveEdgeColor: [1, 1, 1] as Color3,
		u_dissolveSmooth: false,
		u_dissolveMask: 0,

		...createMeshDeformUniforms(),
	};
	/** Camera-facing rotation basis for the billboard effect, as columns. */
	private readonly billboardBasis = new Float32Array(9);
	private readonly outlineUniforms = {
		u_texture: null as WebGLTexture | null,
		u_indexTexture: null as WebGLTexture | null,
		u_outlineSize: 0,
		u_outlineColor: [0, 0, 0] as Color3,
		u_texelSize: [1, 1] as [number, number],
		u_backgroundColor: [0, 0, 0] as Color3,
		u_premultiplied: false,
		u_smoothTransparency: false,
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
			cameraPos: [0, 0, 0],
			cameraUp: [0, 1, 0],
			cameraAzimuth: 0,
			cameraElevation: 0,
			palette: new Float32Array(0),
			paletteBlend: 0,
			meshDeform: null,
			deformPhase: { progress: 1, returning: false },
			vertexGlitch: null,
			glitchPhase: { progress: 1, returning: false },
			glitchActive: false,
			nodeBits: this.nodeBits,
			shatterActive: false,
			transparency: "dithered",
			smoothFades: false,
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

		const baseBuffers = buildAllBuffers(this.gl, model.root);
		return {
			indexTexture: createIndexTexture(this.gl, model.texture),
			paletteTexture: createPaletteTexture(this.gl, model.texture),
			nodeBuffers: baseBuffers,
			baseBuffers,
			voxelBuffers: null,
			voxelActive: null,
			voxelDual: null,
			voxelKey: "",
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
		resolveCyclePhase(
			this.shatterPhase,
			shatter?.progress ?? 0,
			shatter?.cycle,
			time,
		);
		this.shatterActive =
			shatter?.enabled === true &&
			sweepActive(shatter.sweep, this.shatterPhase);

		const dissolve = settings.dissolve;
		resolveCyclePhase(
			this.dissolvePhase,
			dissolve?.progress ?? 0,
			dissolve?.cycle,
			time,
		);
		const dissolveOn =
			dissolve?.enabled === true &&
			sweepActive(dissolve.sweep, this.dissolvePhase);

		const deform = settings.meshDeform;
		resolveCyclePhase(
			this.deformPhase,
			deform?.progress ?? 1,
			deform?.cycle,
			time,
		);

		const glitch = settings.vertexGlitch;
		resolveCyclePhase(
			this.glitchPhase,
			glitch?.progress ?? 1,
			glitch?.cycle,
			time,
		);
		this.glitchActive =
			glitch?.enabled === true && sweepActive(glitch.sweep, this.glitchPhase);

		updateRenderState(model.root);
		this.applyBillboard(settings, model.root, v);
		computeNodeBits(settings, model.root, this.nodeBits);
		this.updatePaletteSwap(settings, model, resources, time);
		this.updateVoxelization(settings, model, resources);

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
		ctx.deformPhase = this.deformPhase;
		ctx.vertexGlitch = settings.vertexGlitch;
		ctx.glitchPhase = this.glitchPhase;
		ctx.glitchActive = this.glitchActive;
		ctx.shatterActive = this.shatterActive;
		ctx.cameraPos[0] = mu.u_cameraPos[0];
		ctx.cameraPos[1] = mu.u_cameraPos[1];
		ctx.cameraPos[2] = mu.u_cameraPos[2];
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
		ctx.palette = model.texture.colors;

		this.prepareModelUniforms(settings, model, resources);

		// Smooth transparency blends fractional alpha, which the scene FBO
		// can only hold premultiplied. A dissolve then draws the model in an
		// opaque and a blended pass, and an opaque background gets composited
		// back after the outlines have read the true coverage.
		const floor = settings.floor;
		const floorOn = floor?.enabled === true;
		const particles = pipeline.getSceneEffect("particles");
		const particlesFade =
			particles instanceof ParticlesEffect &&
			particles.enabled &&
			particles.twinkle > 0;
		const smooth = settings.transparency === "smooth";
		this.fadePasses = smooth && dissolveOn;
		this.smoothFades = smooth && (dissolveOn || floorOn || particlesFade);
		ctx.transparency = settings.transparency;
		ctx.smoothFades = this.smoothFades;

		this.floorShadowOn = false;
		this.floorReflectionOn = false;
		if (floor && floorOn && settings.renderMode < 2) {
			this.drawFloorPasses(floor, resources, vpMatrix, w, h);
		}

		if (useFbo) {
			pipeline.pool.ensure(gl, w, h);
			pipeline.pool.bindScene(gl);

			// With a transparent background the effect chain is premultiplied,
			// and so is the scene pass while it blends smooth fades. Uncovered
			// pixels must be (0, 0, 0, 0) so their color contributes nothing
			// when effects resample or extend coverage.
			if (
				useOutline ||
				useGradientOutline ||
				bgIsTransparent ||
				this.smoothFades
			) {
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
			this.drawModel(resources);
		}

		if (floor && floorOn) {
			this.drawFloorPlane(floor, model, resources, vpMatrix, w, h);
		}

		// Only the model shader and the floor plate write the index attachment,
		// later passes (wireframe, outline, post effects) draw to the color
		// buffer alone.
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

				const writesIndex = useFbo && effect.writesIndex === true;
				if (writesIndex) pipeline.pool.enableIndexWrites(gl);
				effect.render(ctx, vpMatrix, resources);
				if (writesIndex) pipeline.pool.disableIndexWrites(gl);
			}
		}

		if (!useFbo) return;

		// On an opaque background the chain expects straight color, so a
		// premultiplied scene is composited over the background once the
		// outlines have read its coverage.
		const resolve = this.smoothFades && !bgIsTransparent;

		if (useOutline) {
			const inputTexture = pipeline.pool.swap(gl);
			gl.viewport(0, 0, w, h);
			this.drawOutline(
				w,
				h,
				inputTexture,
				pipeline.pool.getIndexTexture(),
				settings,
				bgR,
				bgG,
				bgB,
				bgIsTransparent || this.smoothFades,
			);
		}

		if (pipeline.hasActivePostEffects()) {
			pipeline.pool.detachSceneTextures(gl);
			ctx.depthTexture = pipeline.pool.getDepthTexture();
			ctx.indexTexture = pipeline.pool.getIndexTexture();
			pipeline.execute(
				ctx,
				ctx.backgroundColor,
				bgIsTransparent,
				x,
				y,
				resolve,
			);
		} else {
			if (resolve) pipeline.resolve(ctx, ctx.backgroundColor);
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
		if (resources.voxelBuffers) {
			deleteNodeBuffers(gl, resources.voxelBuffers);
			resources.voxelBuffers = null;
			resources.voxelActive = null;
			resources.voxelDual = null;
			resources.voxelKey = "";
		}
		resources.nodeBuffers = [];
		resources.baseBuffers = [];
	}

	/**
	 * Frees all GPU resources held by this renderer.
	 */
	dispose(): void {
		const gl = this.gl;
		gl.deleteProgram(this.programs.model.program);
		gl.deleteProgram(this.programs.outline.program);
		gl.deleteProgram(this.programs.fur.program);

		if (this.floor) {
			this.floor.dispose(gl);
			this.floor = null;
		}

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
	 * @param indexTexture - The scene's index texture, for the fade coverage.
	 * @param settings - The render settings containing outline parameters.
	 * @param bgR - Background red component (0-1).
	 * @param bgG - Background green component (0-1).
	 * @param bgB - Background blue component (0-1).
	 * @param premultiplied - Whether the scene is premultiplied over
	 *   transparent black, so uncovered pixels stay clear.
	 */
	private drawOutline(
		w: number,
		h: number,
		inputTexture: WebGLTexture,
		indexTexture: WebGLTexture | null,
		settings: RenderSettings,
		bgR: number,
		bgG: number,
		bgB: number,
		premultiplied: boolean,
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
		uniforms.u_indexTexture = indexTexture;
		uniforms.u_outlineSize = settings.outlineSize;
		uniforms.u_outlineColor = settings.outlineColor;
		uniforms.u_texelSize[0] = 1 / w;
		uniforms.u_texelSize[1] = 1 / h;
		uniforms.u_backgroundColor[0] = bgR;
		uniforms.u_backgroundColor[1] = bgG;
		uniforms.u_backgroundColor[2] = bgB;
		uniforms.u_premultiplied = premultiplied;
		uniforms.u_smoothTransparency = settings.transparency === "smooth";
		twgl.setUniforms(this.programs.outline, uniforms);

		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);

		this.stats.drawCalls++;
	}

	/**
	 * Resolves this frame's model and fur uniforms from the settings, so
	 * the scene pass and the floor's passes draw the same model state.
	 * Uploading is left to the passes, which override the view projection.
	 *
	 * @param settings - The current render settings.
	 * @param model - The parsed model.
	 * @param resources - The GPU resources.
	 */
	private prepareModelUniforms(
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const uniforms = this.modelUniforms;
		uniforms.u_indexTexture = resources.indexTexture;
		uniforms.u_paletteTexture = resources.paletteTexture;
		uniforms.u_transparentColor = model.texture.transparentColor;
		uniforms.u_shadingEnabled = settings.shading;
		uniforms.u_renderMode = settings.renderMode;
		uniforms.u_cutoutMask = settings.cutoutMask;
		uniforms.u_clipBelowY = NO_CLIP;
		this.furUniforms.u_clipBelowY = NO_CLIP;
		this.updateMaterialUniforms(settings, model, resources);
		this.updateGeometryUniforms(settings, model, resources);

		const fur = settings.fur;
		const glitchHidesFur =
			this.glitchActive && settings.vertexGlitch?.unit === "triangle";
		this.furLayers =
			fur?.enabled && !this.shatterActive && !glitchHidesFur && fur.length > 0
				? Math.min(Math.max(Math.round(fur.layers), 1), 16)
				: 0;
		if (this.furLayers > 0 && fur) {
			this.updateFurUniforms(fur, settings, resources, this.furLayers);
		}
	}

	/**
	 * Draws the model with the textured/colored shader into the bound
	 * scene target, from the uniforms {@link prepareModelUniforms} resolved.
	 *
	 * @param resources - The GPU resources.
	 */
	private drawModel(resources: ModelResources): void {
		const gl = this.gl;

		gl.useProgram(this.programs.model.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		twgl.setUniforms(this.programs.model, this.modelUniforms);

		this.drawModelPhases(resources);

		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
	}

	/**
	 * Draws the model's two depth phases with the fur shells. Priority
	 * faces, a depth clear, then the rest. The model program must be bound
	 * with its uniforms uploaded.
	 *
	 * @param resources - The GPU resources.
	 */
	private drawModelPhases(resources: ModelResources): void {
		this.drawDepthPhase(PRIORITY_GROUPS, resources);
		this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
		this.drawDepthPhase(NON_PRIORITY_GROUPS, resources);
	}

	/**
	 * Draws one depth phase's render groups and their fur shells. Dithered,
	 * a single pass with the checkerboard deciding each fragment. While a
	 * smooth dissolve runs, an opaque pass first and then the fading
	 * fragments blended over it without depth writes, so a fading surface
	 * shows what is behind it whatever the draw order.
	 *
	 * @param groupIndices - Which render groups to draw.
	 * @param resources - The GPU resources.
	 */
	private drawDepthPhase(
		groupIndices: readonly number[],
		resources: ModelResources,
	): void {
		const gl = this.gl;
		const furLayers = this.furLayers;

		if (!this.fadePasses) {
			this.setFadePass(FADE_DITHERED);
			this.drawGroups(groupIndices, resources);
			if (furLayers > 0) this.drawFur(groupIndices, resources, furLayers);
			return;
		}

		this.setFadePass(FADE_OPAQUE);
		this.drawGroups(groupIndices, resources);
		if (furLayers > 0) this.drawFur(groupIndices, resources, furLayers);

		this.setFadePass(FADE_BLENDED);
		gl.depthMask(false);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		this.drawGroups(groupIndices, resources);
		if (furLayers > 0) this.drawFur(groupIndices, resources, furLayers);
		gl.disable(gl.BLEND);
		gl.depthMask(true);
	}

	/**
	 * Selects the fade pass on the bound model program and on the fur
	 * program's pending uniforms.
	 *
	 * @param pass - The pass to draw.
	 */
	private setFadePass(pass: number): void {
		this.modelUniforms.u_fadePass = pass;
		this.furUniforms.u_fadePass = pass;
		this.fadePassUniforms.u_fadePass = pass;
		twgl.setUniforms(this.programs.model, this.fadePassUniforms);
	}

	/**
	 * Renders the floor's shadow map and reflection image into the floor's
	 * own framebuffers before the scene pass. The shadow map is a depth-only
	 * draw of the model along the shadow direction with culling off, so
	 * every face occludes. The reflection redraws the model through the
	 * view projection mirrored across the plate, from the mirrored camera
	 * and light, with the winding flipped to match and real geometry below
	 * the plate clipped away. Both skip while the camera looks at the plate
	 * from below, where it is opaque.
	 *
	 * @param floor - The enabled floor settings.
	 * @param resources - The GPU resources.
	 * @param vpMatrix - The camera's view-projection matrix, restored afterwards.
	 * @param w - The render width in pixels.
	 * @param h - The render height in pixels.
	 */
	private drawFloorPasses(
		floor: FloorEffect,
		resources: ModelResources,
		vpMatrix: mat4,
		w: number,
		h: number,
	): void {
		const gl = this.gl;
		if (!this.floor) this.floor = new FloorResources();
		const res = this.floor;
		const mu = this.modelUniforms;
		const fu = this.furUniforms;

		writeFloorPlane(this.floorPlane, floor, resources.bounds, mu.u_cameraPos);
		const planeY = this.floorPlane.center[1];
		if (mu.u_cameraPos[1] <= planeY) return;

		gl.useProgram(this.programs.model.program);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);

		const shadow = floor.shadow;
		const reach =
			shadow.enabled && shadow.strength > 0
				? writeFloorLightVp(
						res.lightVp,
						shadow.direction,
						resources.bounds,
						planeY,
					)
				: 0;
		if (reach > 0) {
			mat4.copy(mu.u_vp, res.lightVp);
			mat4.copy(fu.u_vp, res.lightVp);
			res.bindShadowMap(gl);
			this.cullOff = true;
			twgl.setUniforms(this.programs.model, mu);

			const fadePasses = this.fadePasses;
			this.fadePasses = false;
			this.drawModelPhases(resources);
			this.fadePasses = fadePasses;
			this.cullOff = false;
			this.floorShadowOn = true;
			this.floorShadowReach = reach;
		}

		const reflection = floor.reflection;
		if (reflection.enabled && reflection.strength > 0) {
			writeFloorMirror(res.mirror, planeY);
			mat4.multiply(mu.u_vp, vpMatrix, res.mirror);
			mat4.copy(fu.u_vp, mu.u_vp);
			const originX = mu.u_viewportOrigin[0];
			const originY = mu.u_viewportOrigin[1];
			mu.u_viewportOrigin[0] = 0;
			mu.u_viewportOrigin[1] = 0;
			mu.u_clipBelowY = planeY;
			fu.u_clipBelowY = planeY;
			this.mirrorCameraAcrossFloor(planeY);

			res.bindReflection(gl, w, h);
			gl.frontFace(gl.CW);
			twgl.setUniforms(this.programs.model, mu);
			this.drawModelPhases(resources);
			gl.frontFace(gl.CCW);

			this.mirrorCameraAcrossFloor(planeY);
			mu.u_clipBelowY = NO_CLIP;
			fu.u_clipBelowY = NO_CLIP;
			mu.u_viewportOrigin[0] = originX;
			mu.u_viewportOrigin[1] = originY;
			this.floorReflectionOn = true;
		}

		mat4.copy(mu.u_vp, vpMatrix);
		mat4.copy(fu.u_vp, vpMatrix);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
	}

	/**
	 * Mirrors the camera position, basis and the headlight across the
	 * floor plate in place, so a reflection pass sees the model the way the
	 * mirrored camera would. Applying it twice restores the originals.
	 *
	 * @param planeY - The plate's height.
	 */
	private mirrorCameraAcrossFloor(planeY: number): void {
		const mu = this.modelUniforms;
		mu.u_cameraPos[1] = 2 * planeY - mu.u_cameraPos[1];
		mu.u_cameraFwd[1] = -mu.u_cameraFwd[1];
		mu.u_cameraRight[1] = -mu.u_cameraRight[1];
		this.lightDirWorld[1] = -this.lightDirWorld[1];
	}

	/**
	 * Draws the plate into the scene after the model, depth-tested against
	 * it, showing this frame's shadow map and reflection image. Runs while
	 * the index attachment is still bound, so the plate writes the no-model
	 * index itself.
	 *
	 * @param floor - The enabled floor settings.
	 * @param model - The parsed model, for its palette.
	 * @param resources - The GPU resources.
	 * @param vpMatrix - The camera's view-projection matrix.
	 * @param w - The render width in pixels.
	 * @param h - The render height in pixels.
	 */
	private drawFloorPlane(
		floor: FloorEffect,
		model: PicoCAD2Model,
		resources: ModelResources,
		vpMatrix: mat4,
		w: number,
		h: number,
	): void {
		const gl = this.gl;
		if (!this.floor) this.floor = new FloorResources();
		const res = this.floor;
		const u = res.uniforms;
		const palette = model.texture.colors;
		const plane = this.floorPlane;

		writeFloorPlane(
			plane,
			floor,
			resources.bounds,
			this.modelUniforms.u_cameraPos,
		);
		mat4.copy(u.u_vp, vpMatrix);
		u.u_floorCenter[0] = plane.center[0];
		u.u_floorCenter[1] = plane.center[1];
		u.u_floorCenter[2] = plane.center[2];
		u.u_floorHalf = plane.half;
		writeStyledColor(u.u_floorColor, floor.color, floor.style, palette);
		u.u_floorFade = floor.infinite ? 0 : Math.min(Math.max(floor.fade, 0), 1);
		u.u_floorSmooth = floor.style === "smooth";
		u.u_floorSurface = floor.surface;
		u.u_floorGridOn =
			floor.grid.enabled && floor.grid.spacing > 0 && floor.grid.thickness > 0;
		u.u_floorGridSpacing = Math.max(floor.grid.spacing, 1e-4);
		u.u_floorGridThickness = Math.max(floor.grid.thickness, 0);
		writeStyledColor(
			u.u_floorGridColor,
			floor.grid.color,
			floor.style,
			palette,
		);
		u.u_floorShadowOn = this.floorShadowOn;
		u.u_floorShadowMap = res.shadowTexture;
		writeStyledColor(
			u.u_floorShadowColor,
			floor.shadow.color,
			floor.style,
			palette,
		);
		u.u_floorShadowStrength = Math.min(Math.max(floor.shadow.strength, 0), 1);
		u.u_floorShadowSoftness =
			this.floorShadowReach > 0
				? Math.max(floor.shadow.softness, 0) / (2 * this.floorShadowReach)
				: 0;
		u.u_floorReflectionOn = this.floorReflectionOn;
		u.u_floorReflection = res.reflectionTexture;
		u.u_floorReflectionStrength = Math.min(
			Math.max(floor.reflection.strength, 0),
			1,
		);
		u.u_resolution[0] = w;
		u.u_resolution[1] = h;
		u.u_viewportOrigin[0] = this.modelUniforms.u_viewportOrigin[0];
		u.u_viewportOrigin[1] = this.modelUniforms.u_viewportOrigin[1];
		const smooth = this.smoothFades;
		u.u_smoothTransparency = smooth;

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.CULL_FACE);

		if (smooth) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		}
		res.drawPlane(gl);
		if (smooth) gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);

		this.stats.drawCalls++;
		this.stats.polyCount += 2;
	}

	/**
	 * Applies the palette swap / color cycling effect by rewriting the model's
	 * palette LUT on the CPU when its effective remap changes. Restores the
	 * original palette when the effect turns off.
	 *
	 * A smooth cycle blend lerps the LUT's display rows toward the next
	 * step's colors, so every palette consumer crossfades for free. A
	 * dithered blend instead uploads the next step's palette into the LUT's
	 * target row set and drives the shaders' per-pixel dither gate through
	 * the palette blend uniform.
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
			this.modelUniforms.u_paletteBlend = 0;
			this.furUniforms.u_paletteBlend = 0;
			this.effectCtx.paletteBlend = 0;
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

		const { remap, target, blend } = swap.resolveCycle(time);

		const dithered = swap.cycleStyle === "dithered" ? blend : 0;
		this.modelUniforms.u_paletteBlend = dithered;
		this.furUniforms.u_paletteBlend = dithered;
		this.effectCtx.paletteBlend = dithered;

		// The smooth blend lives in the LUT bytes, so it joins the key
		const smooth = swap.cycleStyle === "smooth" ? blend : 0;
		const key = `${remap.join(",")}|${target.join(",")}|${Math.round(smooth * 255)}`;
		if (key === resources.paletteKey) return;

		updatePaletteTexture(
			this.gl,
			resources.paletteTexture,
			buildPaletteData(model.texture, remap, target, smooth),
		);
		resources.paletteKey = key;
	}

	/**
	 * Applies the mesh deform's voxel mode by swapping the active node
	 * buffers to CPU-voxelized stand-in geometry, rebuilt when the grid
	 * size changes and cached until then. The whole model shares one
	 * rest-pose world grid, so overlapping nodes cannot produce z-fighting
	 * duplicate cubes. The voxel meshes render with the real nodes'
	 * transforms, so hierarchy, animation and billboard still apply, and
	 * the remaining GPU deforms bend the cubes.
	 *
	 * @param settings - The current render settings.
	 * @param model - The parsed model, for its meshes and texture.
	 * @param resources - The GPU resources holding both buffer sets.
	 */
	private updateVoxelization(
		settings: RenderSettings,
		model: PicoCAD2Model,
		resources: ModelResources,
	): void {
		const deform = settings.meshDeform;
		const voxel = deform?.enabled ? deform.voxel : null;

		if (
			!deform ||
			!voxel?.enabled ||
			!sweepActive(deform.sweep, this.deformPhase)
		) {
			this.useDrawList(resources, resources.baseBuffers, false);
			return;
		}

		const grid = Math.max(voxel.gridSize, 1e-3);
		const key = `${grid}|${JSON.stringify(deform?.nodes ?? [])}`;
		if (key !== resources.voxelKey) {
			if (resources.voxelBuffers) {
				deleteNodeBuffers(this.gl, resources.voxelBuffers);
			}

			// Only the nodes the deform selects are voxelized, the others keep
			// drawing their base buffers, so the draw list mixes both.
			const selected = (node: SceneNode): boolean =>
				((this.nodeBits.get(node) ?? 0) & NODE_BIT.meshDeform) !== 0;
			const voxels: NodeBuffers[] = [];
			const active: NodeBuffers[] = [];
			const triIdCounter = { value: 0 };

			// Voxel stand-ins are built in voxelizer order so triangle ids (and
			// with them flash and shatter patterns) match a fully voxelized model.
			const meshes = voxelizeModel(model.root, grid, model.texture, selected);
			for (const [node, voxelMesh] of meshes) {
				const nb = buildNodeBuffers(this.gl, node, triIdCounter, voxelMesh);
				if (nb) {
					nb.bakedUvs = true;
					voxels.push(nb);
					active.push(nb);
				}
			}
			for (const base of resources.baseBuffers) {
				if (!selected(base.node)) {
					active.push(base);
				}
			}

			resources.voxelBuffers = voxels;
			resources.voxelActive = active;
			resources.voxelDual = [...voxels, ...resources.baseBuffers];
			resources.voxelKey = key;
		}

		// Until the sweep has covered everything, every selected node draws
		// from both representations, each keeping its side of the front.
		const partial = !sweepComplete(deform.sweep, this.deformPhase);
		this.useDrawList(
			resources,
			(partial ? resources.voxelDual : resources.voxelActive) ??
				resources.baseBuffers,
			partial,
		);
	}

	/**
	 * Makes a buffer list the frame's draw list and marks which side of the
	 * voxel sweep front each entry owns.
	 *
	 * @param resources - The GPU resources for the current model.
	 * @param list - The buffers to draw this frame.
	 * @param split - Whether selected nodes are drawn from both representations.
	 */
	private useDrawList(
		resources: ModelResources,
		list: NodeBuffers[],
		split: boolean,
	): void {
		resources.nodeBuffers = list;
		for (const nb of list) {
			if (!split) {
				nb.voxelSide = -1;
			} else if (nb.bakedUvs) {
				nb.voxelSide = 1;
			} else {
				const bits = this.nodeBits.get(nb.node) ?? 0;
				nb.voxelSide = (bits & NODE_BIT.meshDeform) !== 0 ? 0 : -1;
			}
		}
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
			u.u_interiorPattern = PATTERN_ID[interior.pattern] ?? 0;
			u.u_interiorDepth = Math.max(interior.depth, 0);
			u.u_interiorLayers = Math.min(
				Math.max(Math.round(interior.layers), 1),
				5,
			);
			u.u_interiorScale = interior.scale;
			u.u_interiorSpeed = interior.speed;
			u.u_interiorSeed = interior.seed;
			u.u_interiorHueRange =
				interior.randomHue && interior.style !== "palette"
					? Math.max(interior.hueRange, 0) * Math.PI
					: 0;
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
			u.u_glitterHueRange =
				glitter.randomHue && glitter.style !== "palette"
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
			? dissolve.enabled && sweepActive(dissolve.sweep, this.dissolvePhase)
			: false;
		u.u_dissolveEnabled = dissolveOn;
		if (dissolve && dissolveOn) {
			u.u_dissolveProgress = Math.min(
				Math.max(this.dissolvePhase.progress, 0),
				1,
			);
			u.u_dissolveEdgeWidth = Math.max(dissolve.edgeWidth, 0);
			writeStyledColor(
				u.u_dissolveEdgeColor,
				dissolve.edgeColor,
				dissolve.style,
				palette,
			);
			u.u_dissolveSmooth = dissolve.style === "smooth";
			u.u_dissolveMask = packColorMask(dissolve.maskedColors);
			writeSweepUniforms(
				u.u_dissolveSweep,
				dissolve.sweep,
				this.dissolvePhase,
				resources.bounds,
				u.u_cameraPos,
			);
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

		const projection = settings.projection;
		u.u_projectionEnabled = projection?.enabled ?? false;
		if (projection?.enabled) {
			u.u_projectionPattern = PATTERN_ID[projection.pattern] ?? 0;
			u.u_projectionMode =
				projection.mode === "light" ? 0 : projection.mode === "shadow" ? 1 : 2;
			writeProjectionBasis(
				u.u_projectionDir,
				u.u_projectionU,
				u.u_projectionV,
				projection.direction,
			);
			writeStyledColor(
				u.u_projectionColor,
				projection.color,
				projection.style,
				palette,
			);
			u.u_projectionScale = Math.max(projection.scale, 0.001);
			u.u_projectionSpeed = projection.speed;
			u.u_projectionSeed = projection.seed;
			u.u_projectionStrength = Math.min(Math.max(projection.strength, 0), 1);
			u.u_projectionFacing = Math.min(Math.max(projection.facing, 0), 1);
			u.u_projectionSmooth = projection.style === "smooth";
			u.u_projectionMask = packColorMask(projection.maskedColors);
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

		writeMeshDeformUniforms(
			u,
			settings.meshDeform,
			resources.bounds,
			this.deformPhase,
			u.u_cameraPos,
		);

		const shatter = settings.triangleShatter;
		u.u_shatterEnabled = this.shatterActive;
		if (shatter?.enabled) {
			u.u_shatterProgress = Math.min(
				Math.max(this.shatterPhase.progress, 0),
				1,
			);
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
			writeSweepUniforms(
				u.u_shatterSweep,
				shatter.sweep,
				this.shatterPhase,
				resources.bounds,
				u.u_cameraPos,
			);
		}

		writeVertexGlitchUniforms(
			u,
			settings.vertexGlitch,
			this.glitchActive,
			this.glitchPhase,
			resources.bounds,
			u.u_cameraPos,
		);

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

			// Voxel stand-in buffers carry baked UVs. Leave the dirty flag
			// set so the base buffers update when they return.
			if (nb.node.uvsDirty && !nb.bakedUvs) {
				updateNodeTexCoords(gl, nb);
				nb.node.uvsDirty = false;
			}

			this.nodeUniforms.u_worldMatrix = nb.node.worldMatrix;
			this.nodeUniforms.u_nodeBits = this.nodeBits.get(nb.node) ?? 0;
			this.nodeUniforms.u_voxelSide = nb.voxelSide ?? -1;

			for (const groupIdx of groupIndices) {
				const group = nb.groups[groupIdx];
				if (!group) continue;

				const isDoubleSided =
					(groupIdx & 1) !== 0 || this.shatterActive || this.cullOff;
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
		// resolved model uniforms verbatim (the sweep struct and the vec3s
		// share references).
		u.u_dissolveEnabled = mu.u_dissolveEnabled;
		u.u_dissolveProgress = mu.u_dissolveProgress;
		u.u_dissolveSweep = mu.u_dissolveSweep;
		u.u_dissolveEdgeWidth = mu.u_dissolveEdgeWidth;
		u.u_dissolveEdgeColor = mu.u_dissolveEdgeColor;
		u.u_dissolveSmooth = mu.u_dissolveSmooth;
		u.u_dissolveMask = mu.u_dissolveMask;

		writeMeshDeformUniforms(
			u,
			settings.meshDeform,
			resources.bounds,
			this.deformPhase,
			mu.u_cameraPos,
		);
		u.u_time = mu.u_time;
		writeVertexGlitchUniforms(
			u,
			settings.vertexGlitch,
			this.glitchActive,
			this.glitchPhase,
			resources.bounds,
			mu.u_cameraPos,
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

			const bits = this.nodeBits.get(nb.node) ?? 0;
			if ((bits & NODE_BIT.fur) === 0) continue;

			this.nodeUniforms.u_worldMatrix = nb.node.worldMatrix;
			this.nodeUniforms.u_nodeBits = bits;
			this.nodeUniforms.u_voxelSide = nb.voxelSide ?? -1;

			for (const groupIdx of groupIndices) {
				const group = nb.groups[groupIdx];
				if (!group) continue;

				const isDoubleSided = (groupIdx & 1) !== 0 || this.cullOff;
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
				this.billboardNode(node);
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
