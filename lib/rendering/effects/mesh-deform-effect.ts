import type { WorldBounds } from "../../scene/scene-graph.ts";
import type { Color3 } from "../../types/scene.ts";

export type DeformAxis = "x" | "y" | "z";

/**
 * Stackable closed-form vertex deforms, applied in world space after the
 * node transform and centered on the model's rest-pose bounds. Runs in
 * the vertex shader with no per-frame CPU geometry. The wireframe follows
 * through a shared shader chunk. Applied in a fixed order ending with
 * rounding, so voxelation quantizes the other deforms.
 *
 * Deliberately unmaskable. Adjacent faces share coincident positions, so
 * deforming a masked face next to an unmasked neighbor would tear their
 * shared edge open.
 */
export class MeshDeformEffect {
	enabled = false;
	rounding = { amount: 0, gridSize: 0.25 };
	barrel = { amount: 0, axis: "y" as DeformAxis };
	spherify = { amount: 0 };
	twist = { amount: 0, axis: "y" as DeformAxis, speed: 0 };
}

export interface MeshDeformUniforms {
	u_deformEnabled: boolean;
	u_deformRound: number;
	u_deformRoundGrid: number;
	u_deformBarrel: number;
	u_deformBarrelAxis: number;
	u_deformSpherify: number;
	u_deformTwist: number;
	u_deformTwistAxis: number;
	u_deformTwistPhase: number;
	u_deformCenter: Color3;
	u_deformHalfExt: Color3;
}

const AXIS_INDEX: Record<DeformAxis, number> = { x: 0, y: 1, z: 2 };

/**
 * Maps a deform settings object onto shader uniforms. Used by both the
 * renderer (model program) and the wireframe effect so the two programs
 * always agree on the deformation.
 *
 * @param u - The uniform object to write into.
 * @param deform - The deform settings, or null/disabled for a no-op.
 * @param bounds - The model's rest-pose world bounds.
 * @param time - Elapsed time in seconds, for the animated twist.
 */
export function writeMeshDeformUniforms(
	u: MeshDeformUniforms,
	deform: MeshDeformEffect | null,
	bounds: WorldBounds,
	time: number,
): void {
	u.u_deformEnabled = deform?.enabled ?? false;
	if (!deform?.enabled) return;

	u.u_deformRound = Math.min(Math.max(deform.rounding.amount, 0), 1);
	u.u_deformRoundGrid = Math.max(deform.rounding.gridSize, 1e-4);
	u.u_deformBarrel = deform.barrel.amount;
	u.u_deformBarrelAxis = AXIS_INDEX[deform.barrel.axis] ?? 1;
	u.u_deformSpherify = Math.min(Math.max(deform.spherify.amount, 0), 1);
	u.u_deformTwist = deform.twist.amount;
	u.u_deformTwistAxis = AXIS_INDEX[deform.twist.axis] ?? 1;
	u.u_deformTwistPhase = time * deform.twist.speed;

	for (let axis = 0; axis < 3; axis++) {
		u.u_deformCenter[axis] = (bounds.min[axis] + bounds.max[axis]) * 0.5;
		u.u_deformHalfExt[axis] = Math.max(
			(bounds.max[axis] - bounds.min[axis]) * 0.5,
			1e-5,
		);
	}
}
