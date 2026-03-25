import type { RawExportSettings, RawPicoCAD2File } from "../types/model.ts";
import type {
	CameraBookmark,
	CameraMode,
	CameraState,
	Color3,
	ExportSettings,
	PicoCAD2Model,
} from "../types/scene.ts";
import { parseGraph } from "./graph-parser.ts";
import { parseTexture } from "./texture-parser.ts";

/** Valid camera mode values from PicoCAD 2 export settings. */
const CAMERA_MODES = new Set<CameraMode>(["spin", "sway", "pingpong", "fixed"]);

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

function parseCameraBookmark(raw: RawPicoCAD2File): CameraBookmark | null {
	const bm = raw.metadata.camera?.bookmark;
	if (!bm) return null;

	return {
		target: new Float32Array([bm.target.x, bm.target.y, bm.target.z]),
		distanceToTarget: bm.distance_to_target,
		theta: bm.theta,
		omega: bm.omega,
	};
}

/**
 * Resolves a palette color index to an RGB Color3.
 *
 * @param colors - The palette colors as a flat Float32Array.
 * @param index - The palette index (0-15).
 * @returns The resolved color, or white if the index is out of range.
 */
function paletteColor(colors: Float32Array, index: number): Color3 {
	const i = index * 3;
	if (i + 2 >= colors.length) return [1, 1, 1];
	return [colors[i], colors[i + 1], colors[i + 2]];
}

/**
 * Parses export settings from raw metadata, resolving palette indices to colors.
 *
 * @param raw - The raw export settings from the model file.
 * @param colors - The parsed palette colors.
 * @returns The fully resolved export settings.
 */
function parseExportSettings(
	raw: RawExportSettings | undefined,
	colors: Float32Array,
): ExportSettings {
	const anim = raw?.anim as CameraMode | undefined;
	return {
		cameraMode: anim && CAMERA_MODES.has(anim) ? anim : "fixed",
		cameraModeDirection: raw?.dir === 1 ? "right" : "left",
		cameraModeSpeed: raw?.speed ?? 5,
		animate: raw?.animate ?? false,
		outlineSize: raw?.outline_size ?? 0,
		outlineColor: paletteColor(colors, raw?.outline_color ?? 0),
		scanlines: raw?.scanlines ?? false,
		scanlineColor: paletteColor(colors, raw?.scanline_color ?? 0),
		watermark: raw?.watermark ?? "",
		watermarkColor: paletteColor(colors, raw?.watermark_color ?? 15),
		watermark2: raw?.watermark2 ?? "",
		watermark2Color: paletteColor(colors, raw?.watermark2_color ?? 15),
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

	const texture = parseTexture(raw.texture);

	return {
		root: parseGraph(raw.graph),
		texture,
		motionDuration: raw.metadata.motion_duration,
		shadingEnabled: raw.metadata.shading_mode !== 0,
		camera: parseCameraState(raw),
		bookmark: parseCameraBookmark(raw),
		projectionMode: raw.metadata.export_settings?.fov_type ?? "perspective",
		exportSettings: parseExportSettings(
			raw.metadata.export_settings,
			texture.colors,
		),
	};
}
