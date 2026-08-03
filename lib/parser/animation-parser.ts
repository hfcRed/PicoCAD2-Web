import type { RawClip, RawMotions } from "../types/model.ts";
import type { AnimationClip, MotionData } from "../types/scene.ts";

/**
 * Parses a single raw animation clip into the runtime representation.
 * Converts rotation deltas from full turns to radians and the 1-based
 * face_id of "tex" clips to a 0-based face index.
 * Clips without a prop are invalid and rejected, matching PicoCAD 2.2.
 *
 * @param raw - The raw clip data from the JSON file.
 * @returns The parsed animation clip, or null if the clip is invalid.
 */
function parseClip(raw: RawClip): AnimationClip | null {
	if (typeof raw?.prop !== "string") return null;

	let delta = raw.delta ?? 0;
	if (raw.prop === "rot") {
		delta = delta * 2 * Math.PI;
	}

	return {
		prop: raw.prop,
		axes: raw.axises ?? [],
		start: raw.start ?? 0,
		stop: raw.stop ?? 1,
		delta,
		times: raw.times,
		curve: raw.curve ?? "linear",
		pingpong: raw.pingpong ?? false,
		faceIndex: raw.face_id !== undefined ? raw.face_id - 1 : undefined,
		frames: raw.frames,
		step: raw.step,
		returnUv: raw.return_uv ?? false,
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
	const parseTrack = (track: RawClip[]): AnimationClip[] =>
		track.map(parseClip).filter((clip): clip is AnimationClip => clip !== null);

	return {
		tracks: [
			parseTrack(raw.tracks[0]),
			parseTrack(raw.tracks[1]),
			parseTrack(raw.tracks[2]),
			parseTrack(raw.tracks[3]),
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
