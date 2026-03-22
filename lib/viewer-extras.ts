import { BloomEffect } from "./rendering/effects/bloom-effect.ts";
import { ChromaticAberrationEffect } from "./rendering/effects/chromatic-aberration-effect.ts";
import { ColorGradingEffect } from "./rendering/effects/color-grading-effect.ts";
import { CRTEffect } from "./rendering/effects/crt-effect.ts";
import { DitheringEffect } from "./rendering/effects/dithering-effect.ts";
import { GradientOutlineEffect } from "./rendering/effects/gradient-outline-effect.ts";
import { LensDistortionEffect } from "./rendering/effects/lens-distortion-effect.ts";
import { NoiseEffect } from "./rendering/effects/noise-effect.ts";
import type { PostProcessPipeline } from "./rendering/effects/pipeline.ts";
import { PixelationEffect } from "./rendering/effects/pixelation-effect.ts";
import { PosterizationEffect } from "./rendering/effects/posterization-effect.ts";
import { WireframeEffect } from "./rendering/effects/wireframe-effect.ts";

/**
 * Provides access to extra (non-official) effects for the viewer.
 * All effects are pre-instantiated but disabled by default.
 *
 * Post-process effects are applied in this default order:
 * gradient outline -> color grading -> posterization -> bloom -> dithering ->
 * CRT -> pixelation -> lens distortion -> noise -> chromatic aberration.
 */
export class ViewerExtras {
	readonly wireframe: WireframeEffect;
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

	/**
	 * Creates a new ViewerExtras and registers all effects with the pipeline.
	 * Effects are registered in the default chain order.
	 *
	 * @param pipeline - The post-process pipeline to register effects with.
	 */
	constructor(pipeline: PostProcessPipeline) {
		this.wireframe = new WireframeEffect();
		pipeline.addSceneEffect(this.wireframe);

		this.gradientOutline = new GradientOutlineEffect();
		pipeline.addPostEffect(this.gradientOutline);

		this.colorGrading = new ColorGradingEffect();
		pipeline.addPostEffect(this.colorGrading);

		this.posterization = new PosterizationEffect();
		pipeline.addPostEffect(this.posterization);

		this.bloom = new BloomEffect();
		pipeline.addPostEffect(this.bloom);

		this.dithering = new DitheringEffect();
		pipeline.addPostEffect(this.dithering);

		this.crt = new CRTEffect();
		pipeline.addPostEffect(this.crt);

		this.pixelation = new PixelationEffect();
		pipeline.addPostEffect(this.pixelation);

		this.lensDistortion = new LensDistortionEffect();
		pipeline.addPostEffect(this.lensDistortion);

		this.noise = new NoiseEffect();
		pipeline.addPostEffect(this.noise);

		this.chromaticAberration = new ChromaticAberrationEffect();
		pipeline.addPostEffect(this.chromaticAberration);
	}
}
