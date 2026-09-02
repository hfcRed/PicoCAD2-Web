import type { WorldBounds } from "../../scene/scene-graph.ts";
import type { SweepOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import { type DeepRequired, deepFreeze } from "./effect-defaults.ts";

export type SweepMode =
	| "uniform"
	| "noise"
	| "directional"
	| "point"
	| "proximity";

export const SWEEP_DEFAULTS = deepFreeze<DeepRequired<SweepOptions>>({
	mode: "uniform",
	direction: [0, 1, 0],
	point: [0, 0, 0],
	scale: 8,
	softness: 0.15,
	invert: false,
});

/** The Sweep uniform struct that chunks/sweep.glsl samples. */
export interface SweepUniforms {
	mode: number;
	scale: number;
	axis: Color3;
	axisOffset: number;
	point: Color3;
	invRange: number;
	rangeBias: number;
	flipScale: number;
	flipOffset: number;
	softness: number;
}

const SWEEP_MODE_INDEX: Record<SweepMode, number> = {
	uniform: 0,
	noise: 1,
	directional: 2,
	point: 3,
	proximity: 3,
};

/**
 * Creates a sweep uniform struct in its resting state.
 *
 * @returns The struct, in uniform mode.
 */
export function createSweepUniforms(): SweepUniforms {
	return {
		mode: 0,
		scale: 8,
		axis: [0, 1, 0],
		axisOffset: 0,
		point: [0, 0, 0],
		invRange: 1,
		rangeBias: 0,
		flipScale: 1,
		flipOffset: 0,
		softness: 0.15,
	};
}

/**
 * Resolves sweep settings into the uniforms the sweep chunk samples.
 *
 * Every mode is normalized to the model's rest-pose bounds so a progress
 * of 0 to 1 spans the whole model. Directional projects the bounds onto
 * the direction, point measures to the farthest bounds corner, and
 * proximity measures from the camera across the bounds sphere, so it
 * re-anchors whenever the camera moves. `invert` folds into a scale and
 * offset so the shader needs no branch for it.
 *
 * @param u - The uniform struct to write.
 * @param sweep - The sweep settings.
 * @param bounds - The model's rest-pose world bounds.
 * @param cameraPos - The camera's world position, the center of a proximity sweep.
 */
export function writeSweepUniforms(
	u: SweepUniforms,
	sweep: Required<SweepOptions>,
	bounds: WorldBounds,
	cameraPos: Color3,
): void {
	u.mode = SWEEP_MODE_INDEX[sweep.mode] ?? 0;
	u.scale = Math.max(sweep.scale, 0.01);
	u.softness = Math.max(sweep.softness, 0);
	u.flipScale = sweep.invert ? -1 : 1;
	u.flipOffset = sweep.invert ? 1 : 0;

	if (sweep.mode === "directional") {
		writeDirectional(u, sweep.direction, bounds);
	} else if (sweep.mode === "point") {
		writeDistance(u, sweep.point, 0, farthestCorner(sweep.point, bounds));
	} else if (sweep.mode === "proximity") {
		writeProximity(u, cameraPos, bounds);
	}
}

/**
 * Remaps the projection onto the direction to 0-1 across the bounds.
 *
 * @param u - The uniform struct to write.
 * @param direction - The sweep direction, any length.
 * @param bounds - The model's rest-pose world bounds.
 */
function writeDirectional(
	u: SweepUniforms,
	direction: Color3,
	bounds: WorldBounds,
): void {
	let [dx, dy, dz] = direction;
	const len = Math.hypot(dx, dy, dz);
	if (len < 1e-6) {
		dx = 0;
		dy = 1;
		dz = 0;
	} else {
		dx /= len;
		dy /= len;
		dz /= len;
	}

	const { min, max } = bounds;
	const centerDot =
		dx * ((min[0] + max[0]) / 2) +
		dy * ((min[1] + max[1]) / 2) +
		dz * ((min[2] + max[2]) / 2);
	const halfSpan =
		Math.abs(dx) * Math.max((max[0] - min[0]) / 2, 0) +
		Math.abs(dy) * Math.max((max[1] - min[1]) / 2, 0) +
		Math.abs(dz) * Math.max((max[2] - min[2]) / 2, 0);
	const span = Math.max(halfSpan * 2, 1e-6);

	u.axis[0] = dx / span;
	u.axis[1] = dy / span;
	u.axis[2] = dz / span;
	u.axisOffset = -(centerDot - halfSpan) / span;
}

/**
 * Anchors a proximity sweep at the camera, spanning the bounds sphere
 * from its nearest to its farthest point.
 *
 * @param u - The uniform struct to write.
 * @param cameraPos - The camera's world position.
 * @param bounds - The model's rest-pose world bounds.
 */
function writeProximity(
	u: SweepUniforms,
	cameraPos: Color3,
	bounds: WorldBounds,
): void {
	const { min, max } = bounds;
	const hx = Math.max((max[0] - min[0]) / 2, 0);
	const hy = Math.max((max[1] - min[1]) / 2, 0);
	const hz = Math.max((max[2] - min[2]) / 2, 0);
	const r = Math.hypot(hx, hy, hz);
	const c = Math.hypot(
		cameraPos[0] - (min[0] + max[0]) / 2,
		cameraPos[1] - (min[1] + max[1]) / 2,
		cameraPos[2] - (min[2] + max[2]) / 2,
	);
	writeDistance(u, cameraPos, Math.max(c - r, 0), c + r);
}

/**
 * Writes the shared distance form. The normalized distance from a world
 * point, 0 at minDist and 1 at maxDist.
 *
 * @param u - The uniform struct to write.
 * @param point - The world point the distance is measured from.
 * @param minDist - The distance that maps to 0.
 * @param maxDist - The distance that maps to 1.
 */
function writeDistance(
	u: SweepUniforms,
	point: Color3,
	minDist: number,
	maxDist: number,
): void {
	const range = Math.max(maxDist - minDist, 1e-6);
	u.point[0] = point[0];
	u.point[1] = point[1];
	u.point[2] = point[2];
	u.invRange = 1 / range;
	u.rangeBias = -minDist / range;
}

/**
 * The distance from a point to the farthest corner of the bounds.
 *
 * @param point - The world point.
 * @param bounds - The model's rest-pose world bounds.
 * @returns The distance.
 */
function farthestCorner(point: Color3, bounds: WorldBounds): number {
	let maxSq = 0;
	for (let corner = 0; corner < 8; corner++) {
		const ex = (corner & 1 ? bounds.max : bounds.min)[0] - point[0];
		const ey = (corner & 2 ? bounds.max : bounds.min)[1] - point[1];
		const ez = (corner & 4 ? bounds.max : bounds.min)[2] - point[2];
		maxSq = Math.max(maxSq, ex * ex + ey * ey + ez * ez);
	}
	return Math.sqrt(maxSq);
}
