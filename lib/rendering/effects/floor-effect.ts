import { mat4, vec3 } from "gl-matrix";
import { CAMERA_FAR } from "../../camera/orbit-camera.ts";
import type { WorldBounds } from "../../scene/scene-graph.ts";
import type { FloorOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

/**
 * A pedestal plane under the model. The plate sits at the lowest point of
 * the model's rest-pose bounds, {@link offset} units lower, and spans
 * {@link size} times the model's larger horizontal extent, or reaches the
 * horizon when {@link infinite}. It carries optional world-space
 * {@link grid} lines, a {@link shadow} of the model cast along a direction
 * and a {@link reflection} of the model, and fades out toward its edge
 * over the outer {@link fade} fraction of the plate. With {@link surface}
 * off the plate itself is invisible and only the grid, the shadow and the
 * reflection render.
 *
 * The shadow comes from a depth pass of the whole model along the shadow
 * direction and the reflection from a mirrored draw of it, so animation,
 * deforms, fur and every material effect appear in both. The plate is
 * scenery rather than model. It writes the no-model palette index, so
 * color masks, ambient occlusion and the drop shadow leave it alone while
 * depth fog still reaches it. Seen from below, the plate is opaque and
 * shows neither shadow nor reflection.
 */
export class FloorEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, FLOOR_DEFAULTS);
	}
}

export interface FloorEffect extends Required<FloorOptions> {
	grid: { enabled: boolean; spacing: number; thickness: number; color: Color3 };
	shadow: {
		enabled: boolean;
		direction: [number, number, number];
		color: Color3;
		strength: number;
		softness: number;
	};
	reflection: { enabled: boolean; strength: number };
}

/** Default settings for {@link FloorEffect}. */
export const FLOOR_DEFAULTS = deepFreeze<DeepRequired<FloorOptions>>({
	enabled: false,
	surface: true,
	infinite: false,
	offset: 0,
	size: 2,
	color: [0.4, 0.4, 0.45],
	fade: 0.5,
	grid: { enabled: true, spacing: 1, thickness: 1, color: [0.55, 0.55, 0.6] },
	shadow: {
		enabled: true,
		direction: [0.5, -1, 0.3],
		color: [0.2, 0.2, 0.25],
		strength: 1,
		softness: 0,
	},
	reflection: { enabled: false, strength: 0.5 },
	style: "palette",
});

export interface FloorPlane {
	center: Color3;
	half: number;
}

/**
 * Resolves the plate's placement from the model's rest-pose bounds.
 * Centered under the model at its lowest point minus the offset, spanning
 * the larger horizontal extent times the size. An infinite plate is
 * centered on the camera instead and reaches past the far plane in every
 * direction, so no edge is ever in view.
 *
 * @param out - The plane to write.
 * @param floor - The floor settings.
 * @param bounds - The model's rest-pose world bounds.
 * @param cameraPos - The camera's world position.
 */
export function writeFloorPlane(
	out: FloorPlane,
	floor: FloorEffect,
	bounds: WorldBounds,
	cameraPos: Color3,
): void {
	const [minX, minY, minZ] = bounds.min;
	const [maxX, , maxZ] = bounds.max;
	out.center[1] = minY - floor.offset;
	if (floor.infinite) {
		out.center[0] = cameraPos[0];
		out.center[2] = cameraPos[2];
		out.half = CAMERA_FAR * 2;
		return;
	}

	out.center[0] = (minX + maxX) * 0.5;
	out.center[2] = (minZ + maxZ) * 0.5;
	const extent = Math.max(maxX - minX, maxZ - minZ, 1e-3);
	out.half = Math.max(extent * 0.5 * floor.size, 1e-3);
}

const lightEye = vec3.create();
const lightCenter = vec3.create();
const lightUp = vec3.create();
const lightView = mat4.create();
const lightProjection = mat4.create();

/**
 * Builds the view-projection matrix of the shadow pass. An orthographic
 * camera looking along the shadow direction, wide enough for the model
 * with room for deforms and deep enough to reach the plate. Every plate
 * point a light ray through the model can hit lies inside that footprint,
 * so plate points outside it are lit.
 *
 * @param out - The matrix to write.
 * @param direction - The direction the shadow is cast along.
 * @param bounds - The model's rest-pose world bounds.
 * @param planeY - The plate's height.
 * @returns The light frustum's half width in world units, which the
 *   shadow map spans twice over, or 0 when the direction cannot cast
 *   onto the plate.
 */
export function writeFloorLightVp(
	out: mat4,
	direction: [number, number, number],
	bounds: WorldBounds,
	planeY: number,
): number {
	const [dx, dy, dz] = direction;
	const len = Math.hypot(dx, dy, dz);
	if (len < 1e-6 || dy / len > -0.02) return 0;

	const nx = dx / len;
	const ny = dy / len;
	const nz = dz / len;
	const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
	const cy = (bounds.min[1] + bounds.max[1]) * 0.5;
	const cz = (bounds.min[2] + bounds.max[2]) * 0.5;
	const radius = Math.max(
		Math.hypot(
			bounds.max[0] - bounds.min[0],
			bounds.max[1] - bounds.min[1],
			bounds.max[2] - bounds.min[2],
		) * 0.5,
		1e-3,
	);

	const reach = radius * 1.25;
	const near = reach * 2;
	const far = near + (Math.abs(cy - planeY) + reach) / -ny + reach;

	vec3.set(lightCenter, cx, cy, cz);
	vec3.set(lightEye, cx - nx * near, cy - ny * near, cz - nz * near);
	if (Math.abs(ny) > 0.99) {
		vec3.set(lightUp, 0, 0, 1);
	} else {
		vec3.set(lightUp, 0, 1, 0);
	}

	mat4.lookAt(lightView, lightEye, lightCenter, lightUp);
	mat4.ortho(lightProjection, -reach, reach, -reach, reach, 0, far);
	mat4.multiply(out, lightProjection, lightView);
	return reach;
}

/**
 * Writes the world-space reflection across the plate, y' = 2h - y, to
 * multiply into the view projection for the reflection pass.
 *
 * @param out - The matrix to write.
 * @param planeY - The plate's height.
 */
export function writeFloorMirror(out: mat4, planeY: number): void {
	mat4.identity(out);
	out[5] = -1;
	out[13] = 2 * planeY;
}
