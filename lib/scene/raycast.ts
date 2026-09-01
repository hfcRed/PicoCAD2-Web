import { vec3 } from "gl-matrix";
import type { SceneNode } from "../types/scene.ts";
import { traverseNode } from "./scene-graph.ts";

/** A point where a ray crosses a rendered surface. */
export interface RayCrossing {
	t: number;
	enclosing: boolean;
	membrane: boolean;
}

/** Minimum hit distance, so the ray can't hit surfaces at its own origin. */
const T_MIN = 1e-5;

/** Determinant threshold under which a triangle is parallel to the ray. */
const DET_EPSILON = 1e-12;

/**
 * Slack on the barycentric bounds so the ray can't slip through the shared
 * edge between two adjacent triangles.
 */
const BARY_SLACK = 1e-6;

const va = vec3.create();
const vb = vec3.create();
const vc = vec3.create();
const e1 = vec3.create();
const e2 = vec3.create();
const pvec = vec3.create();
const tvec = vec3.create();
const qvec = vec3.create();

/**
 * Collects every point at which a ray crosses a rendered surface of the
 * scene, sorted by distance. Meshes are tested in their current world pose
 * with the same fan triangulation the renderer draws, and hidden and ghost
 * nodes are skipped.
 *
 * @param root - The root node of the scene graph.
 * @param origin - The world-space ray origin.
 * @param dir - The world-space ray direction, unit length.
 * @returns The crossings along the ray in ascending distance order.
 */
export function collectRayCrossings(
	root: SceneNode,
	origin: vec3,
	dir: vec3,
): RayCrossing[] {
	const crossings: RayCrossing[] = [];

	traverseNode(root, (node) => {
		if (!node.mesh || node.ghost || !node.renderVisible) return;

		const vertices = node.mesh.vertices;
		const world = node.worldMatrix;

		for (const face of node.mesh.faces) {
			const idx = face.vertexIndices;
			if (idx.length < 3) continue;

			vec3.set(
				va,
				vertices[idx[0] * 3],
				vertices[idx[0] * 3 + 1],
				vertices[idx[0] * 3 + 2],
			);
			vec3.transformMat4(va, va, world);
			vec3.set(
				vb,
				vertices[idx[1] * 3],
				vertices[idx[1] * 3 + 1],
				vertices[idx[1] * 3 + 2],
			);
			vec3.transformMat4(vb, vb, world);

			for (let k = 2; k < idx.length; k++) {
				vec3.set(
					vc,
					vertices[idx[k] * 3],
					vertices[idx[k] * 3 + 1],
					vertices[idx[k] * 3 + 2],
				);
				vec3.transformMat4(vc, vc, world);

				intersectScratchTriangle(origin, dir, face.doubleSided, crossings);

				// The fan's next triangle is (first, this third, next vertex).
				vec3.copy(vb, vc);
			}
		}
	});

	crossings.sort((a, b) => a.t - b.t);
	return crossings;
}

/**
 * Möller–Trumbore ray intersection against the triangle currently held in
 * the scratch vertices `va`/`vb`/`vc`, appending any crossing to `out`.
 *
 * The determinant equals `-dot(dir, normal)` for the winding normal
 * `(vb - va) × (vc - va)`, and the renderer culls single-sided faces
 * viewed from the side that normal points away from. So a negative
 * determinant means the ray points out of the face's rendered side.
 *
 * @param origin - The ray origin.
 * @param dir - The ray direction.
 * @param doubleSided - Whether the face renders from both sides.
 * @param out - The list to append the crossing to.
 */
function intersectScratchTriangle(
	origin: vec3,
	dir: vec3,
	doubleSided: boolean,
	out: RayCrossing[],
): void {
	vec3.subtract(e1, vb, va);
	vec3.subtract(e2, vc, va);
	vec3.cross(pvec, dir, e2);
	const det = vec3.dot(e1, pvec);
	if (Math.abs(det) < DET_EPSILON) return;

	const invDet = 1 / det;
	vec3.subtract(tvec, origin, va);
	const u = vec3.dot(tvec, pvec) * invDet;
	if (u < -BARY_SLACK || u > 1 + BARY_SLACK) return;

	vec3.cross(qvec, tvec, e1);
	const v = vec3.dot(dir, qvec) * invDet;
	if (v < -BARY_SLACK || u + v > 1 + BARY_SLACK) return;

	const t = vec3.dot(e2, qvec) * invDet;
	if (t <= T_MIN) return;

	out.push({
		t,
		enclosing: !doubleSided && det < 0,
		membrane: doubleSided,
	});
}
