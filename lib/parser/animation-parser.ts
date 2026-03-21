import type { RawClip, RawMotions } from "../types/model.ts";
import type { AnimationClip, MotionData } from "../types/scene.ts";

/**
 * Parses a single raw animation clip into the runtime representation.
 * Converts rotation deltas from full turns to radians.
 *
 * @param raw - The raw clip data from the JSON file.
 * @returns The parsed animation clip.
 */
function parseClip(raw: RawClip): AnimationClip {
	let delta = raw.delta;
	if (raw.prop === "rot") {
		delta = raw.delta * 2 * Math.PI;
	}

	return {
		prop: raw.prop,
		axes: raw.axises,
		start: raw.start,
		stop: raw.stop,
		delta,
		times: raw.times,
		curve: raw.curve ?? "linear",
		pingpong: raw.pingpong ?? false,
	};
}

/**
 * Parses raw motion data into the runtime representation.
 * Each of the 4 tracks contains an array of animation clips.
 *
 * @param raw - The raw motions data from the JSON file.
 * @returns The parsed motion data with 4 tracks of clips.
 */
export function parseMotions(raw: RawMotions): MotionData {
	return {
		tracks: [
			raw.tracks[0].map(parseClip),
			raw.tracks[1].map(parseClip),
			raw.tracks[2].map(parseClip),
			raw.tracks[3].map(parseClip),
		],
	};
}

/**
 * Creates an empty motion data structure with 4 empty tracks.
 *
 * @returns Empty motion data.
 */
export function createEmptyMotions(): MotionData {
	return {
		tracks: [[], [], [], []],
	};
}
