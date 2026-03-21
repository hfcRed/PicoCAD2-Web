import type { mat4 } from "gl-matrix";
import type { ProjectionMode } from "../types/scene.ts";

/**
 * The non-standard W component used in PicoCAD 2's projection matrices.
 * This creates a tilt-shift depth effect that differs from standard projection.
 */
const GLOBAL_W = 0.35;

/**
 * Creates the appropriate PicoCAD 2 projection matrix for the given mode.
 *
 * @param out - The output mat4.
 * @param mode - The projection mode.
 * @param zoom - The zoom level.
 * @param aspect - The aspect ratio.
 * @param znear - The near clipping plane.
 * @param zfar - The far clipping plane.
 * @param camDist - The camera distance to target (used for orthographic scaling).
 * @returns The output matrix.
 */
export function makeProjectionMatrix(
	out: mat4,
	mode: ProjectionMode,
	zoom: number,
	aspect: number,
	znear: number,
	zfar: number,
	camDist: number,
): mat4 {
	if (mode === "orthographic") {
		return makeOrthoMatrix(out, zoom, aspect, znear, zfar, camDist);
	}
	if (mode === "fisheye") {
		return makeFisheyeMatrix(out, zoom, aspect, znear, zfar);
	}
	return makePerspectiveMatrix(out, zoom, aspect, znear, zfar);
}

/**
 * Creates a PicoCAD 2 perspective projection matrix adapted for WebGL.
 *
 * PicoCAD 2 uses GLOBAL_W = 0.35 instead of 1.0 for the perspective divide.
 * Its depth values are unbounded (no NDC clipping). For WebGL, we map depth to [-1, 1].
 *
 * With gl-matrix's lookAt (visible objects at negative eye_z):
 *   clip_w = -GLOBAL_W * eye_z  (positive for visible objects)
 *   clip_z = A * eye_z + B      (mapped so NDC_z = clip_z/clip_w is in [-1, 1])
 *
 * @param out - The output mat4.
 * @param zoom - The zoom level.
 * @param aspect - The aspect ratio.
 * @param znear - The near clipping plane.
 * @param zfar - The far clipping plane.
 * @returns The output matrix.
 */
function makePerspectiveMatrix(
	out: mat4,
	zoom: number,
	aspect: number,
	znear: number,
	zfar: number,
): mat4 {
	for (let i = 0; i < 16; i++) {
		out[i] = 0;
	}

	// Negate X to match PicoCAD 2's lookAt convention (z = target - eye),
	// which produces a left-pointing right vector. gl-matrix's lookAt
	// (z = eye - target) points right, so we negate X to mirror horizontally.
	out[0] = -(zoom * aspect);
	out[5] = zoom;
	out[10] = (-GLOBAL_W * (zfar + znear)) / (zfar - znear);
	out[11] = -GLOBAL_W;
	out[14] = (-2 * GLOBAL_W * zfar * znear) / (zfar - znear);

	return out;
}

/**
 * Creates a PicoCAD 2 orthographic projection matrix adapted for WebGL.
 *
 * Scale matches perspective at camDist: s = zoom / camDist.
 * Uses GLOBAL_W in m[4][4] (constant clip_w) instead of m[4][3] (depth-dependent clip_w).
 *
 * @param out - The output mat4.
 * @param zoom - The zoom level.
 * @param aspect - The aspect ratio.
 * @param znear - The near clipping plane.
 * @param zfar - The far clipping plane.
 * @param camDist - The camera distance to target.
 * @returns The output matrix.
 */
function makeOrthoMatrix(
	out: mat4,
	zoom: number,
	aspect: number,
	znear: number,
	zfar: number,
	camDist: number,
): mat4 {
	for (let i = 0; i < 16; i++) {
		out[i] = 0;
	}

	const s = zoom / camDist;
	out[0] = -(s * aspect);
	out[5] = s;
	out[10] = (-2 * GLOBAL_W) / (zfar - znear);
	out[14] = (-GLOBAL_W * (zfar + znear)) / (zfar - znear);
	out[15] = GLOBAL_W;

	return out;
}

/**
 * Creates a PicoCAD 2 fisheye projection matrix adapted for WebGL.
 *
 * Same structure as perspective but with a reduced zoom (strength = 0.25),
 * creating a wider FOV with barrel-like distortion.
 *
 * @param out - The output mat4.
 * @param zoom - The zoom level.
 * @param aspect - The aspect ratio.
 * @param znear - The near clipping plane.
 * @param zfar - The far clipping plane.
 * @returns The output matrix.
 */
function makeFisheyeMatrix(
	out: mat4,
	zoom: number,
	aspect: number,
	znear: number,
	zfar: number,
): mat4 {
	const strength = 0.25;
	return makePerspectiveMatrix(out, zoom * strength, aspect, znear, zfar);
}
