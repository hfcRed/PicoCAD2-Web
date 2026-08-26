import { BloomEffect } from "./rendering/effects/bloom-effect.ts";
import { ChromaticAberrationEffect } from "./rendering/effects/chromatic-aberration-effect.ts";
import { ColorCutoutEffect } from "./rendering/effects/color-cutout-effect.ts";
import { ColorGradingEffect } from "./rendering/effects/color-grading-effect.ts";
import { ColorTintEffect } from "./rendering/effects/color-tint-effect.ts";
import { CRTEffect } from "./rendering/effects/crt-effect.ts";
import { DepthFogEffect } from "./rendering/effects/depth-fog-effect.ts";
import { DitheringEffect } from "./rendering/effects/dithering-effect.ts";
import { EdgeDetectionEffect } from "./rendering/effects/edge-detection-effect.ts";
import { GlitchEffect } from "./rendering/effects/glitch-effect.ts";
import { GlitterEffect } from "./rendering/effects/glitter-effect.ts";
import { GradientLightEffect } from "./rendering/effects/gradient-light-effect.ts";
import { GradientOutlineEffect } from "./rendering/effects/gradient-outline-effect.ts";
import { HalftoneEffect } from "./rendering/effects/halftone-effect.ts";
import { LensDistortionEffect } from "./rendering/effects/lens-distortion-effect.ts";
import { NoiseEffect } from "./rendering/effects/noise-effect.ts";
import type { PostProcessPipeline } from "./rendering/effects/pipeline.ts";
import { PixelationEffect } from "./rendering/effects/pixelation-effect.ts";
import { PosterizationEffect } from "./rendering/effects/posterization-effect.ts";
import { RimLightEffect } from "./rendering/effects/rim-light-effect.ts";
import { SharpenEffect } from "./rendering/effects/sharpen-effect.ts";
import { SpecularEffect } from "./rendering/effects/specular-effect.ts";
import { VignetteEffect } from "./rendering/effects/vignette-effect.ts";
import { WireframeEffect } from "./rendering/effects/wireframe-effect.ts";

/**
 * Provides access to extra (non-official) effects for the viewer.
 * All effects are pre-instantiated but disabled by default.
 *
 * Material effects (color cutout, gradient light, specular, rim light,
 * glitter) are applied inside the model shader, in that order, before any
 * post-processing. Post-process effects are applied in this default order:
 * gradient outline -> depth fog -> edge detection -> color grading ->
 * color tint -> posterization -> sharpen -> bloom -> dithering ->
 * halftone -> CRT -> pixelation -> lens distortion -> chromatic aberration ->
 * noise -> glitch -> vignette.
 */
export class ViewerExtras {
	readonly wireframe: WireframeEffect;
	readonly colorCutout: ColorCutoutEffect;
	readonly rimLight: RimLightEffect;
	readonly gradientLight: GradientLightEffect;
	readonly specular: SpecularEffect;
	readonly glitter: GlitterEffect;
	readonly gradientOutline: GradientOutlineEffect;
	readonly colorGrading: ColorGradingEffect;
	readonly posterization: PosterizationEffect;
	readonly bloom: BloomEffect;
	readonly dithering: DitheringEffect;
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

		// Applied inside the model shader, not the effect pipeline.
		this.colorCutout = new ColorCutoutEffect();
		this.rimLight = new RimLightEffect();
		this.gradientLight = new GradientLightEffect();
		this.specular = new SpecularEffect();
		this.glitter = new GlitterEffect();

		// Scene reconstruction
		this.gradientOutline = new GradientOutlineEffect();
		pipeline.addPostEffect(this.gradientOutline);

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
		this.crt = new CRTEffect();
		pipeline.addPostEffect(this.crt);

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
