import { mat4 } from "gl-matrix";
import { computeLocalMatrix } from "../scene/transform.ts";
import type { Face, Mesh, SceneNode, TextureData } from "../types/scene.ts";

const MAX_VOXELS = 60000;

const MAX_STEPS = 256;

interface CellSample {
	d2: number;
	node: SceneNode;
	face: Face;
	u: number;
	v: number;
	x: number;
	y: number;
	z: number;
}

/**
 * Checks whether a UV coordinate lands on the texture's transparent color.
 * Transparent surface regions produce no voxels, matching the fragment
 * discard of the original surface.
 */
function isTransparentTexel(
	texture: TextureData,
	u: number,
	v: number,
): boolean {
	const tx = Math.min(Math.max(Math.floor(u * 128), 0), 127);
	const ty = Math.min(Math.max(Math.floor(v * 128), 0), 127);
	return texture.pixels[ty * 128 + tx] === texture.transparentColor;
}

/**
 * Remeshes a model into strict axis-aligned voxel cubes on a grid.
 *
 * The surface of every face is point-sampled at sub-cell spacing in the
 * model's rest-pose world space, so one world grid is shared by all nodes.
 * Overlapping surfaces from different nodes (like a carpet lying on a floor)
 * resolve to a single cube per cell instead of coplanar duplicates that
 * would z-fight. Each cell keeps the sample closest to its center as its
 * material. The source face's color, flags and priority, and a constant
 * UV, so every cube face renders as the surface texel it replaced.
 *
 * Cubes belong to the node that won their cell and are emitted in that
 * node's mesh space through the inverse rest transform, so they still
 * follow the node's animation. Faces between two occupied cells are culled
 * regardless of owner, back-to-back interface faces would poke through
 * their neighbors at grazing angles and z-fight, leaving one closed shell
 * over the whole model. Cube corners are shared per node, which welds the
 * wireframe and lets the smoothed fur normals average across faces.
 *
 * @param root - The scene graph root.
 * @param gridSize - Voxel edge length in world units.
 * @param texture - The model texture, for skipping transparent texels.
 * @returns The voxelized stand-in mesh for each contributing node.
 */
export function voxelizeModel(
	root: SceneNode,
	gridSize: number,
	texture: TextureData,
): Map<SceneNode, Mesh> {
	const g = Math.max(gridSize, 1e-4);
	const cells = new Map<string, CellSample>();
	const restMatrices = new Map<SceneNode, mat4>();

	// Walk the graph composing rest-pose (static transform) world matrices,
	// mirroring updateRenderState's composition of the animated ones.
	const walk = (parent: SceneNode, parentWorld: mat4): void => {
		for (const child of parent.children) {
			const local = mat4.create();
			computeLocalMatrix(local, child.staticTransform);
			const world = mat4.multiply(mat4.create(), parentWorld, local);

			if (child.mesh && !child.ghost) {
				restMatrices.set(child, world);
				sampleMesh(child, world, g, texture, cells);
			}
			walk(child, world);
		}
	};
	walk(root, mat4.create());

	const byNode = new Map<SceneNode, CellSample[]>();
	for (const cell of cells.values()) {
		const list = byNode.get(cell.node);
		if (list) {
			list.push(cell);
		} else {
			byNode.set(cell.node, [cell]);
		}
	}

	const result = new Map<SceneNode, Mesh>();
	for (const [node, nodeCells] of byNode) {
		const world = restMatrices.get(node);
		const inv = world ? mat4.invert(mat4.create(), world) : null;
		if (!inv) continue;
		result.set(node, buildCubeMesh(nodeCells, cells, g, inv));
	}
	return result;
}

/**
 * Point-samples one node's faces in rest-pose world space into the shared
 * cell map, keeping the closest-to-center sample per cell.
 */
function sampleMesh(
	node: SceneNode,
	world: mat4,
	g: number,
	texture: TextureData,
	cells: Map<string, CellSample>,
): void {
	const mesh = node.mesh;
	if (!mesh) return;
	const verts = mesh.vertices;

	const worldVerts = new Float32Array(verts.length);
	for (let i = 0; i < verts.length; i += 3) {
		const x = verts[i];
		const y = verts[i + 1];
		const z = verts[i + 2];
		worldVerts[i] = world[0] * x + world[4] * y + world[8] * z + world[12];
		worldVerts[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
		worldVerts[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
	}

	for (const face of mesh.faces) {
		if (face.vertexIndices.length < 3) continue;

		const numTriangles = face.vertexIndices.length - 2;
		for (let t = 0; t < numTriangles; t++) {
			const local = [0, t + 1, t + 2];
			const ia = face.vertexIndices[local[0]] * 3;
			const ib = face.vertexIndices[local[1]] * 3;
			const ic = face.vertexIndices[local[2]] * 3;

			const ax = worldVerts[ia];
			const ay = worldVerts[ia + 1];
			const az = worldVerts[ia + 2];
			const abx = worldVerts[ib] - ax;
			const aby = worldVerts[ib + 1] - ay;
			const abz = worldVerts[ib + 2] - az;
			const acx = worldVerts[ic] - ax;
			const acy = worldVerts[ic + 1] - ay;
			const acz = worldVerts[ic + 2] - az;

			const au = face.uvs[local[0] * 2];
			const av = face.uvs[local[0] * 2 + 1];
			const abu = face.uvs[local[1] * 2] - au;
			const abv = face.uvs[local[1] * 2 + 1] - av;
			const acu = face.uvs[local[2] * 2] - au;
			const acv = face.uvs[local[2] * 2 + 1] - av;

			// Clamp sample UVs half a texel inside the triangle's UV bounds.
			// Samples exactly on the UV border otherwise round into the
			// neighboring texture-atlas texel.
			const e = 0.5 / 128;
			const uLo = Math.min(au, au + abu, au + acu) + e;
			const uHi = Math.max(au, au + abu, au + acu) - e;
			const vLo = Math.min(av, av + abv, av + acv) + e;
			const vHi = Math.max(av, av + abv, av + acv) - e;
			const uMid = (uLo + uHi) / 2;
			const vMid = (vLo + vHi) / 2;

			const lenAB = Math.hypot(abx, aby, abz);
			const lenAC = Math.hypot(acx, acy, acz);
			const lenBC = Math.hypot(acx - abx, acy - aby, acz - abz);
			const maxEdge = Math.max(lenAB, lenAC, lenBC);

			// Sample spacing of a third of a cell reliably hits every cell
			// the triangle passes through.
			const steps = Math.min(
				Math.max(Math.ceil((maxEdge / g) * 3), 1),
				MAX_STEPS,
			);

			for (let i = 0; i <= steps; i++) {
				for (let j = 0; j <= steps - i; j++) {
					const s = i / steps;
					const r = j / steps;
					const px = ax + s * abx + r * acx;
					const py = ay + s * aby + r * acy;
					const pz = az + s * abz + r * acz;
					const rawU = au + s * abu + r * acu;
					const rawV = av + s * abv + r * acv;
					const pu = uLo > uHi ? uMid : Math.min(Math.max(rawU, uLo), uHi);
					const pv = vLo > vHi ? vMid : Math.min(Math.max(rawV, vLo), vHi);

					if (!face.noTexture && isTransparentTexel(texture, pu, pv)) {
						continue;
					}

					const cx = Math.floor(px / g);
					const cy = Math.floor(py / g);
					const cz = Math.floor(pz / g);
					const key = `${cx},${cy},${cz}`;

					const dx = px - (cx + 0.5) * g;
					const dy = py - (cy + 0.5) * g;
					const dz = pz - (cz + 0.5) * g;

					// Samples on the triangle border sit at the very edge of
					// the face's UV region, where loosely mapped UVs bleed
					// into neighboring texture-atlas texels. Penalize them so
					// any interior sample wins the cell's material instead.
					const border = i === 0 || j === 0 || i + j === steps;
					const d2 = dx * dx + dy * dy + dz * dz + (border ? g * g * 4 : 0);

					const existing = cells.get(key);
					if (existing) {
						if (d2 < existing.d2) {
							existing.d2 = d2;
							existing.node = node;
							existing.face = face;
							existing.u = pu;
							existing.v = pv;
						}
					} else if (cells.size < MAX_VOXELS) {
						cells.set(key, {
							d2,
							node,
							face,
							u: pu,
							v: pv,
							x: cx,
							y: cy,
							z: cz,
						});
					}
				}
			}
		}
	}
}

/**
 * Emits the cube geometry for one node's cells as a regular mesh in that
 * node's rest-pose mesh space, with faces against any occupied neighbor
 * cell culled and corner vertices shared.
 */
function buildCubeMesh(
	nodeCells: CellSample[],
	allCells: Map<string, CellSample>,
	g: number,
	invWorld: mat4,
): Mesh {
	const positions: number[] = [];
	const cornerIndex = new Map<string, number>();
	const faces: Face[] = [];

	const corner = (x: number, y: number, z: number): number => {
		const key = `${x},${y},${z}`;
		let idx = cornerIndex.get(key);
		if (idx === undefined) {
			idx = positions.length / 3;
			cornerIndex.set(key, idx);

			const wx = x * g;
			const wy = y * g;
			const wz = z * g;
			positions.push(
				invWorld[0] * wx + invWorld[4] * wy + invWorld[8] * wz + invWorld[12],
				invWorld[1] * wx + invWorld[5] * wy + invWorld[9] * wz + invWorld[13],
				invWorld[2] * wx + invWorld[6] * wy + invWorld[10] * wz + invWorld[14],
			);
		}
		return idx;
	};

	// Quad corners per direction as (x, y, z) cell-corner offsets, wound so
	// the cross of the first three points outward (the model pipeline's
	// winding for visible single-sided faces).
	const DIRS: {
		n: [number, number, number];
		q: [number, number, number][];
	}[] = [
		{
			n: [1, 0, 0],
			q: [
				[1, 0, 0],
				[1, 1, 0],
				[1, 1, 1],
				[1, 0, 1],
			],
		},
		{
			n: [-1, 0, 0],
			q: [
				[0, 0, 0],
				[0, 0, 1],
				[0, 1, 1],
				[0, 1, 0],
			],
		},
		{
			n: [0, 1, 0],
			q: [
				[0, 1, 0],
				[0, 1, 1],
				[1, 1, 1],
				[1, 1, 0],
			],
		},
		{
			n: [0, -1, 0],
			q: [
				[0, 0, 0],
				[1, 0, 0],
				[1, 0, 1],
				[0, 0, 1],
			],
		},
		{
			n: [0, 0, 1],
			q: [
				[0, 0, 1],
				[1, 0, 1],
				[1, 1, 1],
				[0, 1, 1],
			],
		},
		{
			n: [0, 0, -1],
			q: [
				[0, 0, 0],
				[0, 1, 0],
				[1, 1, 0],
				[1, 0, 0],
			],
		},
	];

	for (const cell of nodeCells) {
		const src = cell.face;

		// Snap the sample UV to its texel center. Samples near face edges
		// land exactly on texel boundaries, where the GPU's nearest-neighbor
		// rounding can flip into the adjacent texture-atlas texel and
		// speckle the cube with unrelated colors.
		const cu =
			(Math.min(Math.max(Math.floor(cell.u * 128), 0), 127) + 0.5) / 128;
		const cv =
			(Math.min(Math.max(Math.floor(cell.v * 128), 0), 127) + 0.5) / 128;
		const uvs = new Float32Array([cu, cv, cu, cv, cu, cv, cu, cv]);

		for (const dir of DIRS) {
			const nKey = `${cell.x + dir.n[0]},${cell.y + dir.n[1]},${cell.z + dir.n[2]}`;
			if (allCells.has(nKey)) continue;

			const vertexIndices = dir.q.map(([ox, oy, oz]) =>
				corner(cell.x + ox, cell.y + oy, cell.z + oz),
			);

			faces.push({
				vertexIndices,
				uvs,
				staticUvs: uvs,
				color: src.color,
				doubleSided: false,
				priority: src.priority,
				noShading: src.noShading,
				noTexture: src.noTexture,
			});
		}
	}

	return { vertices: new Float32Array(positions), faces };
}
