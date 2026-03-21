import type { mat4 } from "gl-matrix";

/**
 * The non-standard W component used in PicoCAD 2's perspective projection.
 * This creates a tilt-shift depth effect that differs from standard perspective.
 */
const GLOBAL_W = 0.35;

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
export function makePerspectiveMatrix(
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
