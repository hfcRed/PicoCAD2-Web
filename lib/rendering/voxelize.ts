import type { Face, Mesh, TextureData } from "../types/scene.ts";

const MAX_VOXELS = 60000;

const MAX_STEPS = 256;

interface CellSample {
	d2: number;
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
 * Remeshes a mesh into strict axis-aligned voxel cubes on a grid.
 *
 * The surface of every face is point-sampled at sub-cell spacing. Each grid
 * cell touched by the surface becomes a cube spanning that cell.
 * Each cell keeps the sample closest to its center as its material. The
 * source face's color, flags and priority, and a constant UV, so every cube
 * face renders as the surface texel it replaced. Faces between two occupied
 * cells are culled, leaving a closed voxel shell.
 *
 * The grid lives in mesh space, so voxels follow the node transform and
 * animation like the original surface (and scale with a scaled node).
 * Cube corners are shared between cubes, which welds the wireframe and
 * lets the smoothed fur normals average across faces like a normal mesh.
 *
 * @param mesh - The source mesh.
 * @param gridSize - Voxel edge length in mesh units.
 * @param texture - The model texture, for skipping transparent texels.
 * @returns The voxelized mesh (possibly with zero faces).
 */
export function voxelizeMesh(
	mesh: Mesh,
	gridSize: number,
	texture: TextureData,
): Mesh {
	const g = Math.max(gridSize, 1e-4);
	const verts = mesh.vertices;
	const cells = new Map<string, CellSample>();

	for (const face of mesh.faces) {
		if (face.vertexIndices.length < 3) continue;

		const numTriangles = face.vertexIndices.length - 2;
		for (let t = 0; t < numTriangles; t++) {
			const local = [0, t + 1, t + 2];
			const ia = face.vertexIndices[local[0]] * 3;
			const ib = face.vertexIndices[local[1]] * 3;
			const ic = face.vertexIndices[local[2]] * 3;

			const ax = verts[ia];
			const ay = verts[ia + 1];
			const az = verts[ia + 2];
			const abx = verts[ib] - ax;
			const aby = verts[ib + 1] - ay;
			const abz = verts[ib + 2] - az;
			const acx = verts[ic] - ax;
			const acy = verts[ic + 1] - ay;
			const acz = verts[ic + 2] - az;

			const au = face.uvs[local[0] * 2];
			const av = face.uvs[local[0] * 2 + 1];
			const abu = face.uvs[local[1] * 2] - au;
			const abv = face.uvs[local[1] * 2 + 1] - av;
			const acu = face.uvs[local[2] * 2] - au;
			const acv = face.uvs[local[2] * 2 + 1] - av;

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
					const pu = au + s * abu + r * acu;
					const pv = av + s * abv + r * acv;

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
					const d2 = dx * dx + dy * dy + dz * dz;

					const existing = cells.get(key);
					if (existing) {
						if (d2 < existing.d2) {
							existing.d2 = d2;
							existing.face = face;
							existing.u = pu;
							existing.v = pv;
						}
					} else if (cells.size < MAX_VOXELS) {
						cells.set(key, { d2, face, u: pu, v: pv, x: cx, y: cy, z: cz });
					}
				}
			}
		}
	}

	return buildCubeMesh(cells, g);
}

/**
 * Emits the cube geometry for a set of occupied cells as a regular mesh,
 * with faces between adjacent cubes culled and corner vertices shared.
 */
function buildCubeMesh(cells: Map<string, CellSample>, g: number): Mesh {
	const positions: number[] = [];
	const cornerIndex = new Map<string, number>();
	const faces: Face[] = [];

	const corner = (x: number, y: number, z: number): number => {
		const key = `${x},${y},${z}`;
		let idx = cornerIndex.get(key);
		if (idx === undefined) {
			idx = positions.length / 3;
			cornerIndex.set(key, idx);
			positions.push(x * g, y * g, z * g);
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

	for (const cell of cells.values()) {
		const src = cell.face;
		const uvs = new Float32Array([
			cell.u,
			cell.v,
			cell.u,
			cell.v,
			cell.u,
			cell.v,
			cell.u,
			cell.v,
		]);

		for (const dir of DIRS) {
			const nKey = `${cell.x + dir.n[0]},${cell.y + dir.n[1]},${cell.z + dir.n[2]}`;
			if (cells.has(nKey)) continue;

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
