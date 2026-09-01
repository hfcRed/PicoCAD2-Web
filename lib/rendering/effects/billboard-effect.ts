import type { BillboardOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
export type BillboardMode = "full" | "yaw";

/**
 * Turns selected scene nodes toward the camera. Applied by the renderer
 * as CPU matrix surgery after the scene graph update. The rotation basis
 * of each selected node's world matrix is replaced with a camera-facing
 * one, keeping translation and scale.
 *
 * Children inherit the billboarded frame, and billboard wins over
 * animated rotation on the same node. The wireframe shares the world
 * matrices, so it follows automatically.
 */
export class BillboardEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, BILLBOARD_DEFAULTS);
	}
}

export interface BillboardEffect extends Required<BillboardOptions> {}

/** Default settings for {@link BillboardEffect}. */
export const BILLBOARD_DEFAULTS = deepFreeze<DeepRequired<BillboardOptions>>({
	enabled: false,
	nodes: [],
	mode: "full",
});
