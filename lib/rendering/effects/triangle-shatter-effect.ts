import type {
	CycleOptions,
	SweepOptions,
	TriangleShatterOptions,
} from "../../types/options.ts";
import { CYCLE_DEFAULTS } from "./cycle.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
export type TriangleShatterMode = "normal" | "radial" | "directional";

/**
 * Blows the model apart into its triangles. The host animates `progress`,
 * or {@link cycle} runs it from 0 to 1 and back automatically over the
 * elapsed time. Rendering is forced double-sided while active, and the
 * wireframe hides during shatter.
 *
 * The {@link sweep} decides which triangles go first. The default uniform
 * sweep flies every triangle at once. Any other mode gives each triangle
 * the local progress the front has reached at its centroid.
 */
export class TriangleShatterEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, TRIANGLE_SHATTER_DEFAULTS);
	}
}

export interface TriangleShatterEffect
	extends Required<TriangleShatterOptions> {
	cycle: Required<CycleOptions>;
	sweep: Required<SweepOptions>;
}

/** Default settings for {@link TriangleShatterEffect}. */
export const TRIANGLE_SHATTER_DEFAULTS = deepFreeze<
	DeepRequired<TriangleShatterOptions>
>({
	enabled: false,
	progress: 0,
	cycle: { ...CYCLE_DEFAULTS },
	sweep: {
		mode: "uniform",
		direction: [0, 1, 0],
		point: [0, 0, 0],
		scale: 8,
		softness: 0.15,
		invert: false,
	},
	mode: "normal",
	direction: [0, 1, 0],
	distance: 2,
	spread: 0.3,
	rotation: 1,
	gravity: 0,
	shrink: 0,
	maskedColors: [],
	nodes: [],
});
