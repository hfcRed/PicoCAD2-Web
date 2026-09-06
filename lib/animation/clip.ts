import type { AnimationClip } from "../types/scene.ts";
import { type EasingFunction, getEasingFunction, pingpong } from "./easing.ts";

/**
 * Evaluates an animation clip at a given time, returning the modified value.
 * Implements three evaluation modes:
 * 1. Oscillation (when times is set): sine wave oscillation.
 * 2. Visibility toggle: hides during clip duration.
 * 3. Standard easing: applies easing curve with optional pingpong.
 *
 * Scale clips multiply their delta by the node's static scale on the evaluated
 * axis (PicoCAD 2.2 behavior: scale motion is relative to the base scale).
 *
 * @param clip - The animation clip to evaluate.
 * @param startValue - The input value from static transform or previous clip.
 * @param t - The current time in seconds.
 * @param baseScale - The node's static scale on the evaluated axis, for scale clips.
 * @returns The evaluated value after applying this clip's effect.
 */
export function evaluateClip(
	clip: AnimationClip,
	startValue: number,
	t: number,
	baseScale = 1,
): number {
	let delta = clip.delta;
	if (clip.prop === "scale") {
		delta *= baseScale;
	}

	if (clip.times !== undefined) {
		if (t < clip.start) return startValue;

		t = Math.min(t, clip.stop);
		const duration = clip.stop - clip.start;
		if (duration <= 0) return startValue;

		const phase = clip.times * 2 * Math.PI * ((t - clip.start) / duration);

		if (clip.prop === "rot") {
			return startValue + (delta / 2) * Math.sin(phase);
		}
		return startValue + delta * Math.sin(phase);
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
	return startValue + delta * easingFunc(ts, 0, 1, duration);
}

/**
 * Computes the UV frame offset of a "tex" clip at a given time, in pixels.
 * Frames advance evenly across the clip duration. Each frame shifts the UVs
 * by `step` pixels. Before the clip starts the offset is 0. After the clip
 * stops, the offset holds at the last frame, or returns to 0 when returnUv
 * is set.
 *
 * @param clip - The "tex" animation clip to evaluate.
 * @param t - The current time in seconds.
 * @returns The UV offset in pixels (frame index times step).
 */
export function evaluateTexClipFrame(clip: AnimationClip, t: number): number {
	if (t < clip.start) return 0;

	const frames = clip.frames ?? 0;
	const step = clip.step ?? 0;
	const duration = clip.stop - clip.start;
	const frameLength = duration / frames;
	let newFrame = Math.floor((t - clip.start) / frameLength) + 1;

	if (clip.returnUv && t >= clip.stop) return 0;
	if (t >= clip.stop) newFrame = frames;

	return Math.max(1, Math.min(newFrame, frames)) * step;
}
