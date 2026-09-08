import type { RimLightOptions } from "../../types/options.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

/**
 * Fresnel rim on the model's silhouette, applied inside the model shader.
 * On flat-shaded geometry the rim is chunky per-face rather than smooth,
 * which reads like classic sprite edge-lighting at this fidelity.
 *
 * {@link lightAlign} sweeps the rim along the headlight: +1 keeps only the
 * lit side, 0 the whole silhouette, and -1 only the shadow side, which is
 * a backlight (the light is attached to the camera, so "lit from behind"
 * is exactly the silhouette rim tilted away from the light).
 */
export class RimLightEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, RIM_LIGHT_DEFAULTS);
	}
}

export interface RimLightEffect extends Required<RimLightOptions> {}

/** Default settings for {@link RimLightEffect}. */
export const RIM_LIGHT_DEFAULTS = deepFreeze<DeepRequired<RimLightOptions>>({
	enabled: false,
	color: [1, 1, 1],
	width: 0.35,
	sharpness: 0.7,
	lightAlign: 0,
	blend: 1,
	invert: false,
	style: "palette",
	maskedColors: [],
	nodes: [],
});
