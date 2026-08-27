import type { VideoEffectsEffect } from "./video-effects-effect.ts";

/**
 * Deprecated alias for the CRT screen simulation, forwarding to the unified
 * {@link VideoEffectsEffect}. Enabling it switches the video effects to the
 * `"crt"` screen type. Disabling it turns the video effects off while the
 * CRT type is active.
 *
 * @deprecated Use `extras.videoEffects` with `screenType: "crt"` instead.
 */
export class CRTEffect {
	private readonly target: VideoEffectsEffect;

	/**
	 * Creates the alias around the unified video effects instance.
	 *
	 * @param target - The video effects instance to forward to.
	 */
	constructor(target: VideoEffectsEffect) {
		this.target = target;
	}

	get enabled(): boolean {
		return this.target.enabled && this.target.screenType === "crt";
	}

	set enabled(value: boolean) {
		if (value) {
			this.target.screenType = "crt";
			this.target.enabled = true;
		} else if (this.target.screenType === "crt") {
			this.target.enabled = false;
		}
	}

	get modelOnly(): boolean {
		return this.target.modelOnly;
	}

	set modelOnly(value: boolean) {
		this.target.modelOnly = value;
	}

	get curvature(): number {
		return this.target.crt.curvature;
	}

	set curvature(value: number) {
		this.target.crt.curvature = value;
	}

	get scanlineIntensity(): number {
		return this.target.crt.scanlineIntensity;
	}

	set scanlineIntensity(value: number) {
		this.target.crt.scanlineIntensity = value;
	}

	/** Retained for API compatibility. The unified effect is unmasked. */
	get maskedColors(): number[] {
		return this.target.maskedColors;
	}

	set maskedColors(value: number[]) {
		this.target.maskedColors = value;
	}
}
