import { mat4 } from "gl-matrix";
import type { Transform } from "../types/scene.ts";

/**
 * Computes the local transformation matrix from a Transform.
 * Applies transformations in PicoCAD 2 order: Scale -> RotZ -> RotY -> RotX -> Translate.
 * In gl-matrix column-major convention, this means calling in reverse:
 * Translation first, then rotations, then scale.
 *
 * @param out - The output mat4 to write the result to.
 * @param transform - The transform containing position, rotation, and scale.
 * @returns The output matrix.
 */
export function computeLocalMatrix(out: mat4, transform: Transform): mat4 {
	mat4.fromTranslation(out, transform.position);
	mat4.rotateX(out, out, transform.rotation[0]);
	mat4.rotateY(out, out, transform.rotation[1]);
	mat4.rotateZ(out, out, transform.rotation[2]);
	mat4.scale(out, out, transform.scale);
	return out;
}
