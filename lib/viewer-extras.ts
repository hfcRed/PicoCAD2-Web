import {
	BILLBOARD_DEFAULTS,
	BillboardEffect,
} from "./rendering/effects/billboard-effect.ts";
import {
	BLOOM_DEFAULTS,
	BloomEffect,
} from "./rendering/effects/bloom-effect.ts";
import {
	CHROMATIC_ABERRATION_DEFAULTS,
	ChromaticAberrationEffect,
} from "./rendering/effects/chromatic-aberration-effect.ts";
import {
	COLOR_CUTOUT_DEFAULTS,
	ColorCutoutEffect,
} from "./rendering/effects/color-cutout-effect.ts";
import {
	COLOR_GRADING_DEFAULTS,
	ColorGradingEffect,
} from "./rendering/effects/color-grading-effect.ts";
import {
	COLOR_TINT_DEFAULTS,
	ColorTintEffect,
} from "./rendering/effects/color-tint-effect.ts";
import {
	DEPTH_FOG_DEFAULTS,
	DepthFogEffect,
} from "./rendering/effects/depth-fog-effect.ts";
import {
	DISSOLVE_DEFAULTS,
	DissolveEffect,
} from "./rendering/effects/dissolve-effect.ts";
import {
	DITHERING_DEFAULTS,
	DitheringEffect,
} from "./rendering/effects/dithering-effect.ts";
import {
	EDGE_DETECTION_DEFAULTS,
	EdgeDetectionEffect,
} from "./rendering/effects/edge-detection-effect.ts";
import type { DeepReadonly } from "./rendering/effects/effect-defaults.ts";
import {
	EMISSION_DEFAULTS,
	EmissionEffect,
} from "./rendering/effects/emission-effect.ts";
import {
	FLOOR_DEFAULTS,
	FloorEffect,
} from "./rendering/effects/floor-effect.ts";
import { FUR_DEFAULTS, FurEffect } from "./rendering/effects/fur-effect.ts";
import {
	GLITCH_DEFAULTS,
	GlitchEffect,
} from "./rendering/effects/glitch-effect.ts";
import {
	GLITTER_DEFAULTS,
	GlitterEffect,
} from "./rendering/effects/glitter-effect.ts";
import {
	GRADIENT_LIGHT_DEFAULTS,
	GradientLightEffect,
} from "./rendering/effects/gradient-light-effect.ts";
import {
	GRADIENT_OUTLINE_DEFAULTS,
	GradientOutlineEffect,
} from "./rendering/effects/gradient-outline-effect.ts";
import {
	HALFTONE_DEFAULTS,
	HalftoneEffect,
} from "./rendering/effects/halftone-effect.ts";
import {
	INTERIOR_DEFAULTS,
	InteriorEffect,
} from "./rendering/effects/interior-effect.ts";
import {
	LENS_DISTORTION_DEFAULTS,
	LensDistortionEffect,
} from "./rendering/effects/lens-distortion-effect.ts";
import {
	MESH_DEFORM_DEFAULTS,
	MeshDeformEffect,
} from "./rendering/effects/mesh-deform-effect.ts";
import {
	NOISE_DEFAULTS,
	NoiseEffect,
} from "./rendering/effects/noise-effect.ts";
import {
	PALETTE_SWAP_DEFAULTS,
	PaletteSwapEffect,
} from "./rendering/effects/palette-swap-effect.ts";
import {
	PARTICLES_DEFAULTS,
	ParticlesEffect,
} from "./rendering/effects/particles-effect.ts";
import type { PostProcessPipeline } from "./rendering/effects/pipeline.ts";
import {
	PIXELATION_DEFAULTS,
	PixelationEffect,
} from "./rendering/effects/pixelation-effect.ts";
import {
	POSTERIZATION_DEFAULTS,
	PosterizationEffect,
} from "./rendering/effects/posterization-effect.ts";
import {
	PROCEDURAL_BACKGROUND_DEFAULTS,
	ProceduralBackgroundEffect,
} from "./rendering/effects/procedural-background-effect.ts";
import {
	PROJECTION_DEFAULTS,
	ProjectionEffect,
} from "./rendering/effects/projection-effect.ts";
import {
	RIM_LIGHT_DEFAULTS,
	RimLightEffect,
} from "./rendering/effects/rim-light-effect.ts";
import {
	SHARPEN_DEFAULTS,
	SharpenEffect,
} from "./rendering/effects/sharpen-effect.ts";
import {
	SPECULAR_DEFAULTS,
	SpecularEffect,
} from "./rendering/effects/specular-effect.ts";
import { SSAO_DEFAULTS, SSAOEffect } from "./rendering/effects/ssao-effect.ts";
import {
	TRIANGLE_FLASH_DEFAULTS,
	TriangleFlashEffect,
} from "./rendering/effects/triangle-flash-effect.ts";
import {
	TRIANGLE_SHATTER_DEFAULTS,
	TriangleShatterEffect,
} from "./rendering/effects/triangle-shatter-effect.ts";
import {
	VERTEX_GLITCH_DEFAULTS,
	VertexGlitchEffect,
} from "./rendering/effects/vertex-glitch-effect.ts";
import {
	VIDEO_EFFECTS_DEFAULTS,
	VideoEffectsEffect,
} from "./rendering/effects/video-effects-effect.ts";
import {
	VIGNETTE_DEFAULTS,
	VignetteEffect,
} from "./rendering/effects/vignette-effect.ts";
import {
	WIREFRAME_DEFAULTS,
	WireframeEffect,
} from "./rendering/effects/wireframe-effect.ts";
import type { ExtrasOptions, ExtrasState } from "./types/options.ts";

/**
 * Provides access to extra (non-official) effects for the viewer.
 * All effects are pre-instantiated but disabled by default.
 *
 * Material effects (color cutout, dissolve, projection, emission, interior,
 * gradient light, specular, rim light, glitter) are applied inside the
 * model shader, in that order, before any
 * post-processing. Fur shells, the billboard node exclusion and the floor
 * are applied by the renderer alongside the model draw. Scene effects
 * (wireframe, particles) draw into the 3D
 * scene after the model. Post-process effects are applied in this default order:
 * gradient outline -> procedural background -> ssao -> depth fog -> edge detection ->
 * color grading -> color tint -> posterization -> sharpen -> bloom ->
 * dithering -> halftone -> video effects -> pixelation -> lens distortion ->
 * chromatic aberration -> noise -> glitch -> vignette.
 */
export class ViewerExtras {
	readonly wireframe: WireframeEffect;
	readonly particles: ParticlesEffect;
	readonly colorCutout: ColorCutoutEffect;
	readonly dissolve: DissolveEffect;
	readonly paletteSwap: PaletteSwapEffect;
	readonly interior: InteriorEffect;
	readonly rimLight: RimLightEffect;
	readonly gradientLight: GradientLightEffect;
	readonly specular: SpecularEffect;
	readonly glitter: GlitterEffect;
	readonly emission: EmissionEffect;
	readonly projection: ProjectionEffect;
	readonly fur: FurEffect;
	readonly meshDeform: MeshDeformEffect;
	readonly triangleFlash: TriangleFlashEffect;
	readonly triangleShatter: TriangleShatterEffect;
	readonly vertexGlitch: VertexGlitchEffect;
	readonly billboard: BillboardEffect;
	readonly floor: FloorEffect;
	readonly gradientOutline: GradientOutlineEffect;
	readonly proceduralBackground: ProceduralBackgroundEffect;
	readonly ssao: SSAOEffect;
	readonly colorGrading: ColorGradingEffect;
	readonly posterization: PosterizationEffect;
	readonly bloom: BloomEffect;
	readonly dithering: DitheringEffect;
	readonly videoEffects: VideoEffectsEffect;
	readonly pixelation: PixelationEffect;
	readonly lensDistortion: LensDistortionEffect;
	readonly noise: NoiseEffect;
	readonly chromaticAberration: ChromaticAberrationEffect;
	readonly depthFog: DepthFogEffect;
	readonly halftone: HalftoneEffect;
	readonly edgeDetection: EdgeDetectionEffect;
	readonly colorTint: ColorTintEffect;
	readonly sharpen: SharpenEffect;
	readonly glitch: GlitchEffect;
	readonly vignette: VignetteEffect;

	/**
	 * Creates a new ViewerExtras and registers all effects with the pipeline.
	 * Effects are registered in the default chain order.
	 *
	 * @param pipeline - The post-process pipeline to register effects with.
	 */
	constructor(pipeline: PostProcessPipeline) {
		this.wireframe = new WireframeEffect();
		pipeline.addSceneEffect(this.wireframe);

		this.particles = new ParticlesEffect();
		pipeline.addSceneEffect(this.particles);

		// Applied inside the model shader, not the effect pipeline.
		// ---------------
		this.colorCutout = new ColorCutoutEffect();
		this.dissolve = new DissolveEffect();
		// CPU-side palette LUT rewrite, applied by the renderer.
		this.paletteSwap = new PaletteSwapEffect();
		this.interior = new InteriorEffect();
		this.rimLight = new RimLightEffect();
		this.gradientLight = new GradientLightEffect();
		this.specular = new SpecularEffect();
		this.glitter = new GlitterEffect();
		this.emission = new EmissionEffect();
		this.projection = new ProjectionEffect();
		// ---------------

		// Instanced shell pass drawn by the renderer with the model.
		this.fur = new FurEffect();

		// Geometry effects. Vertex-stage, applied in the model shader's
		// vertex stage (flash/shatter mask by face color, deform is unmasked).
		this.meshDeform = new MeshDeformEffect();
		this.triangleFlash = new TriangleFlashEffect();
		this.triangleShatter = new TriangleShatterEffect();
		this.vertexGlitch = new VertexGlitchEffect();

		// CPU matrix exclusion, applied by the renderer after the scene
		// graph update.
		this.billboard = new BillboardEffect();

		// Pedestal plane, drawn by the renderer with the model together with
		// its shadow and reflection passes.
		this.floor = new FloorEffect();

		// Scene reconstruction
		this.gradientOutline = new GradientOutlineEffect();
		pipeline.addPostEffect(this.gradientOutline);

		// After the gradient outline (which needs coverage alpha),
		// before everything else, so later passes apply over the pattern.
		this.proceduralBackground = new ProceduralBackgroundEffect();
		pipeline.addPostEffect(this.proceduralBackground);

		// Early in the chain, so fog and color work apply over the occlusion.
		this.ssao = new SSAOEffect();
		pipeline.addPostEffect(this.ssao);

		this.depthFog = new DepthFogEffect();
		pipeline.addPostEffect(this.depthFog);

		this.edgeDetection = new EdgeDetectionEffect();
		pipeline.addPostEffect(this.edgeDetection);

		// Color correction
		this.colorGrading = new ColorGradingEffect();
		pipeline.addPostEffect(this.colorGrading);

		this.colorTint = new ColorTintEffect();
		pipeline.addPostEffect(this.colorTint);

		this.posterization = new PosterizationEffect();
		pipeline.addPostEffect(this.posterization);

		// Enhancement
		this.sharpen = new SharpenEffect();
		pipeline.addPostEffect(this.sharpen);

		this.bloom = new BloomEffect();
		pipeline.addPostEffect(this.bloom);

		// Stylization
		this.dithering = new DitheringEffect();
		pipeline.addPostEffect(this.dithering);

		this.halftone = new HalftoneEffect();
		pipeline.addPostEffect(this.halftone);

		// Display simulation
		this.videoEffects = new VideoEffectsEffect();
		pipeline.addPostEffect(this.videoEffects);

		this.pixelation = new PixelationEffect();
		pipeline.addPostEffect(this.pixelation);

		// Distortion
		this.lensDistortion = new LensDistortionEffect();
		pipeline.addPostEffect(this.lensDistortion);

		this.chromaticAberration = new ChromaticAberrationEffect();
		pipeline.addPostEffect(this.chromaticAberration);

		// Overlay
		this.noise = new NoiseEffect();
		pipeline.addPostEffect(this.noise);

		this.glitch = new GlitchEffect();
		pipeline.addPostEffect(this.glitch);

		this.vignette = new VignetteEffect();
		pipeline.addPostEffect(this.vignette);
	}

	/**
	 * Restores every effect to its defaults, enabled state included. Call an
	 * effect's own `reset()` to restore its settings while keeping it enabled.
	 */
	reset(): void {
		for (const key of Object.keys(
			EXTRAS_DEFAULTS,
		) as (keyof typeof EXTRAS_DEFAULTS)[]) {
			this[key].reset();
			this[key].enabled = EXTRAS_DEFAULTS[key].enabled;
		}
	}
}

/**
 * The default settings of every extra effect, deep-frozen. The values match
 * a freshly constructed viewer's effects. Use {@link getDefaultExtras} for a
 * mutable copy.
 */
export const EXTRAS_DEFAULTS = Object.freeze({
	wireframe: WIREFRAME_DEFAULTS,
	particles: PARTICLES_DEFAULTS,
	proceduralBackground: PROCEDURAL_BACKGROUND_DEFAULTS,
	colorCutout: COLOR_CUTOUT_DEFAULTS,
	dissolve: DISSOLVE_DEFAULTS,
	paletteSwap: PALETTE_SWAP_DEFAULTS,
	interior: INTERIOR_DEFAULTS,
	rimLight: RIM_LIGHT_DEFAULTS,
	gradientLight: GRADIENT_LIGHT_DEFAULTS,
	specular: SPECULAR_DEFAULTS,
	glitter: GLITTER_DEFAULTS,
	emission: EMISSION_DEFAULTS,
	projection: PROJECTION_DEFAULTS,
	fur: FUR_DEFAULTS,
	meshDeform: MESH_DEFORM_DEFAULTS,
	triangleFlash: TRIANGLE_FLASH_DEFAULTS,
	triangleShatter: TRIANGLE_SHATTER_DEFAULTS,
	vertexGlitch: VERTEX_GLITCH_DEFAULTS,
	billboard: BILLBOARD_DEFAULTS,
	floor: FLOOR_DEFAULTS,
	gradientOutline: GRADIENT_OUTLINE_DEFAULTS,
	ssao: SSAO_DEFAULTS,
	colorGrading: COLOR_GRADING_DEFAULTS,
	posterization: POSTERIZATION_DEFAULTS,
	bloom: BLOOM_DEFAULTS,
	dithering: DITHERING_DEFAULTS,
	videoEffects: VIDEO_EFFECTS_DEFAULTS,
	pixelation: PIXELATION_DEFAULTS,
	lensDistortion: LENS_DISTORTION_DEFAULTS,
	noise: NOISE_DEFAULTS,
	chromaticAberration: CHROMATIC_ABERRATION_DEFAULTS,
	depthFog: DEPTH_FOG_DEFAULTS,
	halftone: HALFTONE_DEFAULTS,
	edgeDetection: EDGE_DETECTION_DEFAULTS,
	colorTint: COLOR_TINT_DEFAULTS,
	sharpen: SHARPEN_DEFAULTS,
	glitch: GLITCH_DEFAULTS,
	vignette: VIGNETTE_DEFAULTS,
} satisfies DeepReadonly<Required<ExtrasOptions>>);

/**
 * Returns a fresh, mutable copy of every effect's default settings.
 */
export function getDefaultExtras(): ExtrasState {
	return structuredClone(EXTRAS_DEFAULTS) as ExtrasState;
}
