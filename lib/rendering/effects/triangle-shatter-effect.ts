import type { TriangleShatterOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
export type TriangleShatterMode = "normal" | "radial" | "directional";

/**
 * Blows the model apart into its triangles. The host animates `progress`.
 * Rendering is forced double-sided while active, and the wireframe
 * hides during shatter.
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
	extends Required<TriangleShatterOptions> {}

/** Default settings for {@link TriangleShatterEffect}. */
export const TRIANGLE_SHATTER_DEFAULTS = deepFreeze<
	DeepRequired<TriangleShatterOptions>
>({
	enabled: false,
	progress: 0,
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
