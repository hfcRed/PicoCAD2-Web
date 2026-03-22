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
 * Builds GPU buffers for a single mesh by fan-triangulating its faces
 * and sorting them into render groups.
 *
 * @param gl - The WebGL 2 rendering context.
 * @param node - The scene node containing the mesh.
 * @returns The node buffer data, or null if the node has no mesh.
 */
export function buildNodeBuffers(
	gl: WebGL2RenderingContext,
	node: SceneNode,
): NodeBuffers | null {
	if (!node.mesh) return null;

	const mesh = node.mesh;

	// Collect triangulated vertex data per group
	const groupPositions: number[][] = [[], [], [], []];
	const groupNormals: number[][] = [[], [], [], []];
	const groupTexCoords: number[][] = [[], [], [], []];
	const groupColorIndices: number[][] = [[], [], [], []];
	const groupFaceFlags: number[][] = [[], [], [], []];

	// Wireframe line positions
	const wirePositions: number[] = [];

	for (const face of mesh.faces) {
		if (face.vertexIndices.length < 3) continue;

		const group = getFaceGroup(face);
		const normal = computeFaceNormal(mesh, face);
		const flags = (face.noShading ? 1 : 0) | (face.noTexture ? 2 : 0);

		// Fan triangulation of the face into triangles
		const numTriangles = face.vertexIndices.length - 2;
		for (let t = 0; t < numTriangles; t++) {
			const indices = [0, t + 1, t + 2];
			for (const localIdx of indices) {
				const vertIdx = face.vertexIndices[localIdx] * 3;
				groupPositions[group].push(
					mesh.vertices[vertIdx],
					mesh.vertices[vertIdx + 1],
					mesh.vertices[vertIdx + 2],
				);
				groupNormals[group].push(normal[0], normal[1], normal[2]);
				groupTexCoords[group].push(
					face.uvs[localIdx * 2],
					face.uvs[localIdx * 2 + 1],
				);
				groupColorIndices[group].push(face.color);
				groupFaceFlags[group].push(flags);
			}
		}

		// Wireframe line loop for the face edges
		for (let i = 0; i < face.vertexIndices.length; i++) {
			const i0 = face.vertexIndices[i] * 3;
			const i1 = face.vertexIndices[(i + 1) % face.vertexIndices.length] * 3;
			wirePositions.push(
				mesh.vertices[i0],
				mesh.vertices[i0 + 1],
				mesh.vertices[i0 + 2],
				mesh.vertices[i1],
				mesh.vertices[i1 + 1],
				mesh.vertices[i1 + 2],
			);
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
		});
	}

	return { node, groups, wireframe };
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

	traverseNode(root, (node) => {
		if (!node.mesh) return;
		const buffers = buildNodeBuffers(gl, node);
		if (buffers) {
			allBuffers.push(buffers);
		}
	});

	return allBuffers;
}
