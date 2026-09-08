import type { WorldBounds } from "../../scene/scene-graph.ts";
import type {
	CycleOptions,
	MeshDeformOptions,
	SweepOptions,
} from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import { CYCLE_DEFAULTS, type CyclePhase } from "./cycle.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import {
	createSweepUniforms,
	type SweepUniforms,
	sweepActive,
	writeSweepUniforms,
} from "./sweep.ts";

export type DeformAxis = "x" | "y" | "z";

/**
 * Stackable geometry deforms. `voxel` remeshes the model into strict
 * axis-aligned cubes on a grid (`gridSize` = voxel edge length). The
 * renderer swaps in CPU-voxelized stand-in geometry, so the result is real
 * closed cubes, not a vertex warp. The remaining deforms (barrel, spherify,
 * twist) are closed-form world-space vertex warps applied after the node
 * transform and centered on the model's rest-pose bounds, running in the
 * vertex shader with no per-frame CPU geometry. The wireframe follows
 * through a shared shader chunk (and shows the voxel cube edges). The
 * vertex warps apply on top of the voxelized mesh, so a voxel model can
 * still bulge and twist.
 *
 * {@link progress} runs the whole deform from 0 (untouched) to 1 (full),
 * by hand or through {@link cycle}, and the {@link sweep} decides where
 * the front is. The warps scale by the local progress at each vertex, so
 * a directional sweep bends the model from one end. Voxelization cannot
 * be weighted per vertex, so while the progress is partial the renderer
 * draws a selected node from both its base mesh and its voxel stand-in
 * and each draw keeps its side of the front, cut through the shading
 * checkerboard.
 *
 * Deliberately unmaskable. Adjacent faces share coincident positions, so
 * deforming a masked face next to an unmasked neighbor would tear their
 * shared edge open.
 */
export class MeshDeformEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, MESH_DEFORM_DEFAULTS);
	}
}

export interface MeshDeformEffect extends Required<MeshDeformOptions> {
	cycle: Required<CycleOptions>;
	sweep: Required<SweepOptions>;
	voxel: { enabled: boolean; gridSize: number };
	barrel: { amount: number; axis: DeformAxis };
	spherify: { amount: number };
	twist: { amount: number; axis: DeformAxis };
}

/** Default settings for {@link MeshDeformEffect}. */
export const MESH_DEFORM_DEFAULTS = deepFreeze<DeepRequired<MeshDeformOptions>>(
	{
		enabled: false,
		nodes: [],
		progress: 1,
		cycle: { ...CYCLE_DEFAULTS },
		sweep: {
			mode: "uniform",
			direction: [0, 1, 0],
			point: [0, 0, 0],
			scale: 8,
			softness: 0.15,
			wave: 0,
			invert: false,
		},
		voxel: { enabled: false, gridSize: 0.25 },
		barrel: { amount: 0, axis: "y" },
		spherify: { amount: 0 },
		twist: { amount: 0, axis: "y" },
	},
);

export interface MeshDeformUniforms {
	u_deformEnabled: boolean;
	u_deformProgress: number;
	u_deformSweep: SweepUniforms;
	u_deformBarrel: number;
	u_deformBarrelAxis: number;
	u_deformSpherify: number;
	u_deformTwist: number;
	u_deformTwistAxis: number;
	u_deformCenter: Color3;
	u_deformHalfExt: Color3;
	u_voxelGrid: number;
}

const AXIS_INDEX: Record<DeformAxis, number> = { x: 0, y: 1, z: 2 };

/**
 * Creates the deform uniforms in their resting state, for every program
 * that includes the deform chunk.
 *
 * @returns The uniforms, deform disabled.
 */
export function createMeshDeformUniforms(): MeshDeformUniforms {
	return {
		u_deformEnabled: false,
		u_deformProgress: 1,
		u_deformSweep: createSweepUniforms(),
		u_deformBarrel: 0,
		u_deformBarrelAxis: 1,
		u_deformSpherify: 0,
		u_deformTwist: 0,
		u_deformTwistAxis: 1,
		u_deformCenter: [0, 0, 0],
		u_deformHalfExt: [1, 1, 1],
		u_voxelGrid: 1,
	};
}

/**
 * Maps a deform settings object onto shader uniforms. Used by both the
 * renderer (model and fur programs) and the wireframe effect so every
 * program agrees on the deformation and on the sweep front. The voxel
 * remesh has no uniforms, it is applied by the renderer as a geometry
 * swap.
 *
 * @param u - The uniform object to write into.
 * @param deform - The deform settings, or null/disabled for a no-op.
 * @param bounds - The model's rest-pose world bounds.
 * @param phase - The deform's phase this frame, after its cycle.
 * @param cameraPos - The camera's world position, for a proximity sweep.
 */
export function writeMeshDeformUniforms(
	u: MeshDeformUniforms,
	deform: MeshDeformEffect | null,
	bounds: WorldBounds,
	phase: CyclePhase,
	cameraPos: Color3,
): void {
	// The bounds center also anchors the radial shatter, so it stays current
	// whether or not the deform is enabled. The renderer outlives the model.
	for (let axis = 0; axis < 3; axis++) {
		u.u_deformCenter[axis] = (bounds.min[axis] + bounds.max[axis]) * 0.5;
		u.u_deformHalfExt[axis] = Math.max(
			(bounds.max[axis] - bounds.min[axis]) * 0.5,
			1e-5,
		);
	}

	const active = deform?.enabled === true && sweepActive(deform.sweep, phase);
	u.u_deformEnabled = active;
	if (!deform || !active) return;

	u.u_deformProgress = Math.min(Math.max(phase.progress, 0), 1);
	u.u_voxelGrid = Math.max(deform.voxel.gridSize, 1e-3);
	writeSweepUniforms(u.u_deformSweep, deform.sweep, phase, bounds, cameraPos);
	u.u_deformBarrel = deform.barrel.amount;
	u.u_deformBarrelAxis = AXIS_INDEX[deform.barrel.axis] ?? 1;
	u.u_deformSpherify = Math.min(Math.max(deform.spherify.amount, 0), 1);
	u.u_deformTwist = deform.twist.amount;
	u.u_deformTwistAxis = AXIS_INDEX[deform.twist.axis] ?? 1;
}
