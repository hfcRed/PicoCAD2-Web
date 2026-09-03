import { vec3 } from "gl-matrix";
import * as twgl from "twgl.js";
import { traverseNode } from "../scene/scene-graph.ts";
import type { Face, Mesh, SceneNode } from "../types/scene.ts";

export interface MeshBufferGroup {
	bufferInfo: twgl.BufferInfo;
	triangleCount: number;
}

export interface NodeBuffers {
	node: SceneNode;
	groups: (MeshBufferGroup | null)[];
	wireframe: twgl.BufferInfo | null;
	/**
	 * True for buffers whose UVs are baked (voxelized meshes). Animated
	 * "tex" clips must not re-upload the node's face UVs into them.
	 */
	bakedUvs?: boolean;
	/**
	 * Which side of the voxel sweep's front this draw owns while a node is
	 * drawn from both its base mesh (0) and its voxel stand-in (1).
	 * Undefined or -1 draws the whole surface.
	 */
	voxelSide?: number;
}

/**
 * Render groups based on face properties.
 * Group 0: Non-priority, single-sided
 * Group 1: Non-priority, double-sided
 * Group 2: Priority, single-sided
 * Group 3: Priority, double-sided
 */
const NUM_GROUPS = 4;

/**
 * Determines which render group a face belongs to.
 *
 * @param face - The face to classify.
 * @returns The render group index (0-3).
 */
function getFaceGroup(face: Face): number {
	let group = 0;
	if (face.doubleSided) group |= 1;
	if (face.priority) group |= 2;
	return group;
}

/**
 * Collects fan-triangulated texture coordinates per render group,
 * in the same face and triangle order as buildNodeBuffers.
 * Used both when building buffers and when re-uploading animated UVs.
 *
 * @param mesh - The mesh whose face UVs to collect.
 * @returns Per-group texcoord arrays.
 */
function collectGroupTexCoords(
	mesh: Mesh,
): [number[], number[], number[], number[]] {
	const groups: [number[], number[], number[], number[]] = [[], [], [], []];

	for (const face of mesh.faces) {
		if (face.vertexIndices.length < 3) continue;

		const group = getFaceGroup(face);
		const numTriangles = face.vertexIndices.length - 2;
		for (let t = 0; t < numTriangles; t++) {
			for (const localIdx of [0, t + 1, t + 2]) {
				groups[group].push(face.uvs[localIdx * 2], face.uvs[localIdx * 2 + 1]);
			}
		}
	}

	return groups;
}

/**
 * Re-uploads the texture coordinate buffers of a node from its current
 * face UVs. Called when "tex" clip animation changed the UVs.
 *
 * @param gl - The WebGL 2 rendering context.
 * @param nodeBuffers - The node buffer data to update.
 */
export function updateNodeTexCoords(
	gl: WebGL2RenderingContext,
	nodeBuffers: NodeBuffers,
): void {
	const mesh = nodeBuffers.node.mesh;
	if (!mesh) return;

	const groupTexCoords = collectGroupTexCoords(mesh);
	for (let g = 0; g < NUM_GROUPS; g++) {
		const group = nodeBuffers.groups[g];
		if (!group) continue;

		const attrib = group.bufferInfo.attribs?.a_texCoord;
		if (!attrib) continue;

		gl.bindBuffer(gl.ARRAY_BUFFER, attrib.buffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(groupTexCoords[g]));
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}
}

/**
 * Computes the face normal from the first three vertices using cross product.
 *
 * @param mesh - The mesh containing the vertices.
 * @param face - The face whose normal to compute.
 * @returns The normalized face normal vector.
 */
function computeFaceNormal(mesh: Mesh, face: Face): Float32Array {
	const v = mesh.vertices;
	const i0 = face.vertexIndices[0] * 3;
	const i1 = face.vertexIndices[1] * 3;
	const i2 = face.vertexIndices[2] * 3;

	const ab = vec3.fromValues(
		v[i1] - v[i0],
		v[i1 + 1] - v[i0 + 1],
		v[i1 + 2] - v[i0 + 2],
	);
	const ac = vec3.fromValues(
		v[i2] - v[i0],
		v[i2 + 1] - v[i0 + 1],
		v[i2 + 2] - v[i0 + 2],
	);

	vec3.normalize(ab, ab);
	vec3.normalize(ac, ac);

	const normal = vec3.create();
	vec3.cross(normal, ab, ac);
	vec3.normalize(normal, normal);

	return normal as Float32Array;
}

/**
 * Computes position-averaged smoothed normals for a mesh. The buffers are
 * unwelded (per-corner face normals), so fur shells offset along face
 * normals would crack apart at edges. Averaging the face normals of
 * all faces sharing a position gives a continuous offset direction.
 *
 * Vertices are keyed by position, so seams where the source data has
 * duplicate vertices at the same spot are welded as well.
 *
 * @param mesh - The mesh to average.
 * @param faceNormals - Precomputed per-face normals, aligned to mesh.faces.
 * @returns A map from "x,y,z" position key to the summed (unnormalized) normal.
 */
function computeSmoothedNormals(
	mesh: Mesh,
	faceNormals: (Float32Array | null)[],
): Map<string, [number, number, number]> {
	const sums = new Map<string, [number, number, number]>();
	const v = mesh.vertices;

	for (let f = 0; f < mesh.faces.length; f++) {
		const normal = faceNormals[f];
		if (!normal) continue;

		// Each face contributes once per distinct position it touches.
		const seen = new Set<string>();
		for (const vertIdx of mesh.faces[f].vertexIndices) {
			const i = vertIdx * 3;
			const key = `${v[i]},${v[i + 1]},${v[i + 2]}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const sum = sums.get(key);
			if (sum) {
				sum[0] += normal[0];
				sum[1] += normal[1];
				sum[2] += normal[2];
			} else {
				sums.set(key, [normal[0], normal[1], normal[2]]);
			}
		}
	}

	return sums;
}

/**
 * Looks up the normalized smoothed normal at a position. Opposing faces
 * can cancel the average out, so it falls back to the face normal to keep
 * an offset direction.
 *
 * @param smoothedNormals - The summed normals per position key.
 * @param x - The position's x.
 * @param y - The position's y.
 * @param z - The position's z.
 * @param fallback - The face normal used when the average is degenerate.
 * @returns The normalized smoothed normal.
 */
function smoothedNormalAt(
	smoothedNormals: Map<string, [number, number, number]>,
	x: number,
	y: number,
	z: number,
	fallback: Float32Array,
): [number, number, number] {
	const sum = smoothedNormals.get(`${x},${y},${z}`);
	const len = sum ? Math.hypot(sum[0], sum[1], sum[2]) : 0;
	if (!sum || len <= 1e-5) return [fallback[0], fallback[1], fallback[2]];
	return [sum[0] / len, sum[1] / len, sum[2] / len];
}

/**
 * Builds GPU buffers for a single mesh by fan-triangulating its faces
 * and sorting them into render groups.
 *
 * @param gl - The WebGL 2 rendering context.
 * @param node - The scene node containing the mesh.
 * @param triIdCounter - Model-wide triangle id counter for geometry effects.
 * @param meshOverride - Optional mesh to build instead of the node's own
 *   (used for voxelized stand-in geometry rendered with the node's transform).
 * @returns The node buffer data, or null if the node has no mesh.
 */
export function buildNodeBuffers(
	gl: WebGL2RenderingContext,
	node: SceneNode,
	triIdCounter: { value: number } = { value: 0 },
	meshOverride?: Mesh,
): NodeBuffers | null {
	const mesh = meshOverride ?? node.mesh;
	if (!mesh) return null;

	// Collect triangulated vertex data per group
	const groupPositions: number[][] = [[], [], [], []];
	const groupNormals: number[][] = [[], [], [], []];
	const groupSmoothNormals: number[][] = [[], [], [], []];
	const groupColorIndices: number[][] = [[], [], [], []];
	const groupFaceFlags: number[][] = [[], [], [], []];
	const groupTriIds: number[][] = [[], [], [], []];
	const groupTriCentroids: number[][] = [[], [], [], []];

	const groupTexCoords = collectGroupTexCoords(mesh);

	const faceNormals = mesh.faces.map((face) =>
		face.vertexIndices.length < 3 ? null : computeFaceNormal(mesh, face),
	);
	const smoothedNormals = computeSmoothedNormals(mesh, faceNormals);

	const wirePositions: number[] = [];
	const wireSmoothNormals: number[] = [];

	for (let f = 0; f < mesh.faces.length; f++) {
		const face = mesh.faces[f];
		const normal = faceNormals[f];
		if (!normal) continue;

		const group = getFaceGroup(face);
		const flags =
			(face.noShading ? 1 : 0) |
			(face.noTexture ? 2 : 0) |
			(face.interior ? 4 : 0);

		// Fan triangulation of the face into triangles
		const numTriangles = face.vertexIndices.length - 2;
		for (let t = 0; t < numTriangles; t++) {
			const indices = [0, t + 1, t + 2];

			// Per-triangle attributes for geometry effects
			const triId = triIdCounter.value++;
			let cx = 0;
			let cy = 0;
			let cz = 0;
			for (const localIdx of indices) {
				const vertIdx = face.vertexIndices[localIdx] * 3;
				cx += mesh.vertices[vertIdx] / 3;
				cy += mesh.vertices[vertIdx + 1] / 3;
				cz += mesh.vertices[vertIdx + 2] / 3;
			}

			for (const localIdx of indices) {
				const vertIdx = face.vertexIndices[localIdx] * 3;
				const px = mesh.vertices[vertIdx];
				const py = mesh.vertices[vertIdx + 1];
				const pz = mesh.vertices[vertIdx + 2];
				groupPositions[group].push(px, py, pz);
				groupNormals[group].push(normal[0], normal[1], normal[2]);
				groupColorIndices[group].push(face.color);
				groupFaceFlags[group].push(flags);
				groupTriIds[group].push(triId);
				groupTriCentroids[group].push(cx, cy, cz);

				groupSmoothNormals[group].push(
					...smoothedNormalAt(smoothedNormals, px, py, pz, normal),
				);
			}
		}

		// Wireframe line loop for the face edges
		for (let i = 0; i < face.vertexIndices.length; i++) {
			const i0 = face.vertexIndices[i] * 3;
			const i1 = face.vertexIndices[(i + 1) % face.vertexIndices.length] * 3;
			for (const idx of [i0, i1]) {
				const x = mesh.vertices[idx];
				const y = mesh.vertices[idx + 1];
				const z = mesh.vertices[idx + 2];
				wirePositions.push(x, y, z);
				wireSmoothNormals.push(
					...smoothedNormalAt(smoothedNormals, x, y, z, normal),
				);
			}
		}
	}

	const groups: (MeshBufferGroup | null)[] = [];
	for (let g = 0; g < NUM_GROUPS; g++) {
		if (groupPositions[g].length === 0) {
			groups.push(null);
			continue;
		}

		const bufferInfo = twgl.createBufferInfoFromArrays(gl, {
			a_position: {
				numComponents: 3,
				data: new Float32Array(groupPositions[g]),
			},
			a_normal: { numComponents: 3, data: new Float32Array(groupNormals[g]) },
			a_smoothNormal: {
				numComponents: 3,
				data: new Float32Array(groupSmoothNormals[g]),
			},
			a_texCoord: {
				numComponents: 2,
				data: new Float32Array(groupTexCoords[g]),
			},
			a_colorIndex: {
				numComponents: 1,
				data: new Float32Array(groupColorIndices[g]),
			},
			a_faceFlags: {
				numComponents: 1,
				data: new Float32Array(groupFaceFlags[g]),
			},
			a_triId: {
				numComponents: 1,
				data: new Float32Array(groupTriIds[g]),
			},
			a_triCentroid: {
				numComponents: 3,
				data: new Float32Array(groupTriCentroids[g]),
			},
		});

		groups.push({
			bufferInfo,
			triangleCount: groupPositions[g].length / 3,
		});
	}

	let wireframe: twgl.BufferInfo | null = null;
	if (wirePositions.length > 0) {
		wireframe = twgl.createBufferInfoFromArrays(gl, {
			a_position: { numComponents: 3, data: new Float32Array(wirePositions) },
			a_smoothNormal: {
				numComponents: 3,
				data: new Float32Array(wireSmoothNormals),
			},
		});
	}

	return { node, groups, wireframe };
}

/**
 * Deletes the GL buffers held by a list of node buffers. Used when
 * voxelized stand-in geometry is rebuilt for a new grid size.
 *
 * @param gl - The WebGL 2 rendering context.
 * @param buffers - The node buffers to delete.
 */
export function deleteNodeBuffers(
	gl: WebGL2RenderingContext,
	buffers: NodeBuffers[],
): void {
	const deleteInfo = (info: twgl.BufferInfo): void => {
		for (const attrib of Object.values(info.attribs ?? {})) {
			gl.deleteBuffer(attrib.buffer);
		}
	};

	for (const nb of buffers) {
		for (const group of nb.groups) {
			if (group) deleteInfo(group.bufferInfo);
		}
		if (nb.wireframe) deleteInfo(nb.wireframe);
	}
}

/**
 * Builds GPU buffers for all mesh nodes in the scene graph.
 *
 * @param gl - The WebGL 2 rendering context.
 * @param root - The root node of the scene graph.
 * @returns An array of node buffer data for all mesh nodes.
 */
export function buildAllBuffers(
	gl: WebGL2RenderingContext,
	root: SceneNode,
): NodeBuffers[] {
	const allBuffers: NodeBuffers[] = [];
	const triIdCounter = { value: 0 };

	traverseNode(root, (node) => {
		if (!node.mesh) return;
		const buffers = buildNodeBuffers(gl, node, triIdCounter);

		if (buffers) {
			allBuffers.push(buffers);
		}
	});

	return allBuffers;
}
