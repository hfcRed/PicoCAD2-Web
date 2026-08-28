import { BillboardEffect } from "./rendering/effects/billboard-effect.ts";
import { BloomEffect } from "./rendering/effects/bloom-effect.ts";
import { ChromaticAberrationEffect } from "./rendering/effects/chromatic-aberration-effect.ts";
import { ColorCutoutEffect } from "./rendering/effects/color-cutout-effect.ts";
import { ColorGradingEffect } from "./rendering/effects/color-grading-effect.ts";
import { ColorTintEffect } from "./rendering/effects/color-tint-effect.ts";
import { CRTEffect } from "./rendering/effects/crt-effect.ts";
import { DepthFogEffect } from "./rendering/effects/depth-fog-effect.ts";
import { DissolveEffect } from "./rendering/effects/dissolve-effect.ts";
import { DitheringEffect } from "./rendering/effects/dithering-effect.ts";
import { EdgeDetectionEffect } from "./rendering/effects/edge-detection-effect.ts";
import { EmissionEffect } from "./rendering/effects/emission-effect.ts";
import { FurEffect } from "./rendering/effects/fur-effect.ts";
import { GlitchEffect } from "./rendering/effects/glitch-effect.ts";
import { GlitterEffect } from "./rendering/effects/glitter-effect.ts";
import { GradientLightEffect } from "./rendering/effects/gradient-light-effect.ts";
import { GradientOutlineEffect } from "./rendering/effects/gradient-outline-effect.ts";
import { HalftoneEffect } from "./rendering/effects/halftone-effect.ts";
import { InteriorEffect } from "./rendering/effects/interior-effect.ts";
import { LensDistortionEffect } from "./rendering/effects/lens-distortion-effect.ts";
import { MeshDeformEffect } from "./rendering/effects/mesh-deform-effect.ts";
import { NoiseEffect } from "./rendering/effects/noise-effect.ts";
import { PaletteSwapEffect } from "./rendering/effects/palette-swap-effect.ts";
import { ParticlesEffect } from "./rendering/effects/particles-effect.ts";
import type { PostProcessPipeline } from "./rendering/effects/pipeline.ts";
import { PixelationEffect } from "./rendering/effects/pixelation-effect.ts";
import { PosterizationEffect } from "./rendering/effects/posterization-effect.ts";
import { ProceduralBackgroundEffect } from "./rendering/effects/procedural-background-effect.ts";
import { RimLightEffect } from "./rendering/effects/rim-light-effect.ts";
import { SharpenEffect } from "./rendering/effects/sharpen-effect.ts";
import { SpecularEffect } from "./rendering/effects/specular-effect.ts";
import { SSAOEffect } from "./rendering/effects/ssao-effect.ts";
import { TriangleFlashEffect } from "./rendering/effects/triangle-flash-effect.ts";
import { TriangleShatterEffect } from "./rendering/effects/triangle-shatter-effect.ts";
import { VideoEffectsEffect } from "./rendering/effects/video-effects-effect.ts";
import { VignetteEffect } from "./rendering/effects/vignette-effect.ts";
import { WireframeEffect } from "./rendering/effects/wireframe-effect.ts";

/**
 * Provides access to extra (non-official) effects for the viewer.
 * All effects are pre-instantiated but disabled by default.
 *
 * Material effects (color cutout, dissolve, emission, interior, gradient
 * light, specular, rim light, glitter) are applied inside the model
 * shader, in that order, before any
 * post-processing. Fur shells and the billboard node exclusion are applied
 * by the renderer alongside the model draw. Scene effects (wireframe,
 * particles) draw into the 3D
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
	readonly fur: FurEffect;
	readonly meshDeform: MeshDeformEffect;
	readonly triangleFlash: TriangleFlashEffect;
	readonly triangleShatter: TriangleShatterEffect;
	readonly billboard: BillboardEffect;
	readonly gradientOutline: GradientOutlineEffect;
	readonly proceduralBackground: ProceduralBackgroundEffect;
	readonly ssao: SSAOEffect;
	readonly colorGrading: ColorGradingEffect;
	readonly posterization: PosterizationEffect;
	readonly bloom: BloomEffect;
	readonly dithering: DitheringEffect;
	readonly videoEffects: VideoEffectsEffect;
	/** @deprecated Use {@link videoEffects} with `screenType: "crt"` instead. */
	readonly crt: CRTEffect;
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
		// ---------------

		// Instanced shell pass drawn by the renderer with the model.
		this.fur = new FurEffect();

		// Geometry effects. Vertex-stage, applied in the model shader's
		// vertex stage (flash/shatter mask by face color, deform is unmasked).
		this.meshDeform = new MeshDeformEffect();
		this.triangleFlash = new TriangleFlashEffect();
		this.triangleShatter = new TriangleShatterEffect();

		// CPU matrix exclusion, applied by the renderer after the scene
		// graph update.
		this.billboard = new BillboardEffect();

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
		this.crt = new CRTEffect(this.videoEffects);

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
}
