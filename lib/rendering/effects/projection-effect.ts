import type { ProjectionOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import type { PatternName } from "./patterns.ts";

export type ProjectionEffectMode = "light" | "shadow" | "tint";
export type ProjectionPattern = PatternName;

/**
 * Projects a pattern from the shared library onto the model's surfaces
 * along {@link direction}. The pattern is sampled on the plane perpendicular
 * to the direction, so it stays put while the model moves along the axis,
 * and only faces turned toward the incoming direction receive it ({@link facing}).
 *
 * {@link mode} decides what the pattern does to the surface. "light"
 * lifts shaded texels toward their lit color, "shadow" pushes them down
 * the shade rows, and "tint" paints {@link color} where the pattern hits.
 * Palette style steps through the palette's shade rows with checkerboard
 * dithering, so the render stays palette-pure. Light therefore only shows
 * on shaded surfaces, since lit is the palette's brightest. Smooth style
 * blends instead.
 */
export class ProjectionEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, PROJECTION_DEFAULTS);
	}
}

export interface ProjectionEffect extends Required<ProjectionOptions> {}

/** Default settings for {@link ProjectionEffect}. */
export const PROJECTION_DEFAULTS = deepFreeze<DeepRequired<ProjectionOptions>>({
	enabled: false,
	pattern: "voronoi",
	direction: [0, -1, 0],
	mode: "shadow",
	color: [1, 1, 1],
	scale: 2,
	speed: 0.5,
	seed: 0,
	strength: 1,
	facing: 0.3,
	style: "palette",
	maskedColors: [],
	nodes: [],
});

/**
 * Normalizes the projection direction and builds the plane basis the
 * pattern is sampled on. Two unit vectors perpendicular to the direction
 * and to each other. A zero direction falls back to straight down.
 *
 * @param dir - Receives the normalized travel direction.
 * @param u - Receives the first plane axis.
 * @param v - Receives the second plane axis.
 * @param direction - The configured direction, any length.
 */
export function writeProjectionBasis(
	dir: Color3,
	u: Color3,
	v: Color3,
	direction: Color3,
): void {
	let [dx, dy, dz] = direction;
	const len = Math.hypot(dx, dy, dz);
	if (len < 1e-6) {
		dx = 0;
		dy = -1;
		dz = 0;
	} else {
		dx /= len;
		dy /= len;
		dz /= len;
	}
	dir[0] = dx;
	dir[1] = dy;
	dir[2] = dz;

	// Cross with the world axis least aligned with the direction so the
	// basis never degenerates.
	const hy = Math.abs(dy) < 0.9 ? 1 : 0;
	const hx = 1 - hy;
	let ux = dy * 0 - dz * hy;
	let uy = dz * hx - dx * 0;
	let uz = dx * hy - dy * hx;
	const ulen = Math.hypot(ux, uy, uz);
	ux /= ulen;
	uy /= ulen;
	uz /= ulen;
	u[0] = ux;
	u[1] = uy;
	u[2] = uz;

	v[0] = dy * uz - dz * uy;
	v[1] = dz * ux - dx * uz;
	v[2] = dx * uy - dy * ux;
}
