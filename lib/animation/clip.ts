import type { AnimationClip } from "../types/scene.ts";
import { type EasingFunction, getEasingFunction, pingpong } from "./easing.ts";

/**
 * Evaluates an animation clip at a given time, returning the modified value.
 * Implements three evaluation modes:
 * 1. Oscillation (when times is set): sine wave oscillation.
 * 2. Visibility toggle: hides during clip duration.
 * 3. Standard easing: applies easing curve with optional pingpong.
 *
 * @param clip - The animation clip to evaluate.
 * @param startValue - The input value from static transform or previous clip.
 * @param t - The current time in seconds.
 * @returns The evaluated value after applying this clip's effect.
 */
export function evaluateClip(
	clip: AnimationClip,
	startValue: number,
	t: number,
): number {
	if (clip.times !== undefined) {
		if (t < clip.start) return startValue;

		t = Math.min(t, clip.stop);
		const duration = clip.stop - clip.start;
		if (duration <= 0) return startValue;

		const phase = clip.times * 2 * Math.PI * ((t - clip.start) / duration);

		if (clip.prop === "rot") {
			return startValue + (clip.delta / 2) * Math.sin(phase);
		}
		return startValue + clip.delta * Math.sin(phase);
	}

	if (clip.prop === "visible") {
		if (t >= clip.start && t < clip.stop) {
			return 0;
		}
		return startValue;
	}

	let easingFunc: EasingFunction = getEasingFunction(clip.curve);
	if (clip.pingpong) {
		easingFunc = pingpong(easingFunc);
	}

	const duration = clip.stop - clip.start;
	const ts = Math.max(0, Math.min(t - clip.start, duration));
	return startValue + clip.delta * easingFunc(ts, 0, 1, duration);
}
