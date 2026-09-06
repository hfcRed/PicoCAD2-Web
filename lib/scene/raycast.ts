import { mat4, vec3 } from "gl-matrix";
import type { Mesh, MeshBounds, SceneNode } from "../types/scene.ts";

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

/** Padding on the mesh bounds, so a ray grazing a face is never rejected early. */
const BOUNDS_PAD = 1e-4;

const inverse = mat4.create();
const origin = vec3.create();
const dir = vec3.create();
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
 * The ray is brought into each mesh's space instead of every vertex into
 * world space, which keeps the parametric distance and the barycentrics
 * unchanged and costs one matrix inverse per node, and a node whose
 * bounds the ray misses is skipped without testing a triangle.
 *
 * @param root - The root node of the scene graph.
 * @param worldOrigin - The world-space ray origin.
 * @param worldDir - The world-space ray direction, unit length.
 * @returns The crossings along the ray in ascending distance order.
 */
export function collectRayCrossings(
	root: SceneNode,
	worldOrigin: vec3,
	worldDir: vec3,
): RayCrossing[] {
	const crossings: RayCrossing[] = [];
	collectNode(root, worldOrigin, worldDir, crossings);
	crossings.sort((a, b) => a.t - b.t);
	return crossings;
}

/**
 * Tests a node's children, and their descendants, against the ray.
 *
 * @param node - The parent node.
 * @param worldOrigin - The world-space ray origin.
 * @param worldDir - The world-space ray direction.
 * @param out - The list to append crossings to.
 */
function collectNode(
	node: SceneNode,
	worldOrigin: vec3,
	worldDir: vec3,
	out: RayCrossing[],
): void {
	const children = node.children;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child.mesh && !child.ghost && child.renderVisible) {
			intersectMesh(child, child.mesh, worldOrigin, worldDir, out);
		}
		collectNode(child, worldOrigin, worldDir, out);
	}
}

/**
 * The mesh's bounds in its own space, computed on first use. Vertices
 * never change after parsing, animation moves the node's transform.
 *
 * @param mesh - The mesh.
 * @returns The bounds.
 */
function meshBounds(mesh: Mesh): MeshBounds {
	if (mesh.bounds) return mesh.bounds;

	const min: [number, number, number] = [Infinity, Infinity, Infinity];
	const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
	const v = mesh.vertices;
	for (let i = 0; i < v.length; i += 3) {
		for (let axis = 0; axis < 3; axis++) {
			const value = v[i + axis];
			if (value < min[axis]) min[axis] = value;
			if (value > max[axis]) max[axis] = value;
		}
	}
	mesh.bounds = { min, max };
	return mesh.bounds;
}

/**
 * Whether the ray enters the padded bounds ahead of its origin. A slab
 * test with the ray's parametric distances, so a hit inside the box at a
 * distance the triangle test accepts is never rejected.
 *
 * @param bounds - The mesh-space bounds.
 * @returns Whether a triangle inside the bounds can be hit.
 */
function rayHitsBounds(bounds: MeshBounds): boolean {
	let tMin = -Infinity;
	let tMax = Infinity;
	for (let axis = 0; axis < 3; axis++) {
		const o = origin[axis];
		const d = dir[axis];
		const low = bounds.min[axis] - BOUNDS_PAD;
		const high = bounds.max[axis] + BOUNDS_PAD;
		if (Math.abs(d) < 1e-12) {
			if (o < low || o > high) return false;
			continue;
		}
		const inv = 1 / d;
		let t0 = (low - o) * inv;
		let t1 = (high - o) * inv;
		if (t0 > t1) {
			const swap = t0;
			t0 = t1;
			t1 = swap;
		}
		if (t0 > tMin) tMin = t0;
		if (t1 < tMax) tMax = t1;
		if (tMax < tMin) return false;
	}
	return tMax > T_MIN;
}

/**
 * Tests every triangle of a mesh in the mesh's own space.
 *
 * @param node - The node the mesh belongs to, for its world matrix.
 * @param mesh - The mesh.
 * @param worldOrigin - The world-space ray origin.
 * @param worldDir - The world-space ray direction.
 * @param out - The list to append crossings to.
 */
function intersectMesh(
	node: SceneNode,
	mesh: Mesh,
	worldOrigin: vec3,
	worldDir: vec3,
	out: RayCrossing[],
): void {
	const world = node.worldMatrix;
	if (!mat4.invert(inverse, world)) return;

	vec3.transformMat4(origin, worldOrigin, inverse);
	const dx = worldDir[0];
	const dy = worldDir[1];
	const dz = worldDir[2];
	dir[0] = inverse[0] * dx + inverse[4] * dy + inverse[8] * dz;
	dir[1] = inverse[1] * dx + inverse[5] * dy + inverse[9] * dz;
	dir[2] = inverse[2] * dx + inverse[6] * dy + inverse[10] * dz;

	if (!rayHitsBounds(meshBounds(mesh))) return;

	// A mirroring transform flips the winding, and with it the sign that
	// tells the rendered side of a single-sided face.
	const flip = mat4.determinant(world) < 0;
	const vertices = mesh.vertices;

	for (const face of mesh.faces) {
		const idx = face.vertexIndices;
		if (idx.length < 3) continue;

		vec3.set(
			va,
			vertices[idx[0] * 3],
			vertices[idx[0] * 3 + 1],
			vertices[idx[0] * 3 + 2],
		);
		vec3.set(
			vb,
			vertices[idx[1] * 3],
			vertices[idx[1] * 3 + 1],
			vertices[idx[1] * 3 + 2],
		);

		for (let k = 2; k < idx.length; k++) {
			vec3.set(
				vc,
				vertices[idx[k] * 3],
				vertices[idx[k] * 3 + 1],
				vertices[idx[k] * 3 + 2],
			);

			intersectScratchTriangle(face.doubleSided, flip, out);

			// The fan's next triangle is (first, this third, next vertex).
			vec3.copy(vb, vc);
		}
	}
}

/**
 * Möller–Trumbore ray intersection against the triangle currently held in
 * the scratch vertices `va`/`vb`/`vc`, appending any crossing to `out`.
 *
 * The determinant equals `-dot(dir, normal)` for the winding normal
 * `(vb - va) × (vc - va)`, and the renderer culls single-sided faces
 * viewed from the side that normal points away from. So a negative
 * determinant means the ray points out of the face's rendered side, in
 * world space. In a mirrored mesh space the sign is the other way round.
 *
 * @param doubleSided - Whether the face renders from both sides.
 * @param flip - Whether the node's transform mirrors the winding.
 * @param out - The list to append the crossing to.
 */
function intersectScratchTriangle(
	doubleSided: boolean,
	flip: boolean,
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
		enclosing: !doubleSided && det < 0 !== flip,
		membrane: doubleSided,
	});
}
