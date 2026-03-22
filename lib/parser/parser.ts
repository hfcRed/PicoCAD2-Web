import type { RawPicoCAD2File } from "../types/model.ts";
import type { CameraState, PicoCAD2Model } from "../types/scene.ts";
import { parseGraph } from "./graph-parser.ts";
import { parseTexture } from "./texture-parser.ts";

/**
 * Parses the camera state from raw metadata, if present.
 *
 * @param raw - The raw PicoCAD 2 file data.
 * @returns The camera state or null if not present.
 */
function parseCameraState(raw: RawPicoCAD2File): CameraState | null {
	const cam = raw.metadata.camera;
	if (!cam) return null;

	return {
		target: new Float32Array([cam.target.x, cam.target.y, cam.target.z]),
		distanceToTarget: cam.distance_to_target,
		theta: cam.theta,
		omega: cam.omega,
	};
}

/**
 * Parses a PicoCAD 2 model file from a JSON string.
 * Throws an error if the string appears to be a PicoCAD 1 file.
 *
 * @param source - The raw JSON string content of the model file.
 * @returns The fully parsed PicoCAD 2 model ready for rendering.
 * @throws Error if the source is a PicoCAD 1 file or invalid JSON.
 */
export function parseModel(source: string): PicoCAD2Model {
	if (source.startsWith("picocad;")) {
		throw new Error(
			"PicoCAD 1 file detected. Only PicoCAD 2 files are supported.",
		);
	}

	let raw: RawPicoCAD2File;
	try {
		raw = JSON.parse(source);
	} catch {
		throw new Error("Failed to parse PicoCAD 2 model: invalid JSON");
	}

	return {
		root: parseGraph(raw.graph),
		texture: parseTexture(raw.texture),
		motionDuration: raw.metadata.motion_duration,
		shadingEnabled: raw.metadata.shading_mode !== 0,
		camera: parseCameraState(raw),
		projectionMode: raw.metadata.export_settings?.fov_type ?? "perspective",
	};
}
