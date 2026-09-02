import type { SpecularOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";

/**
 * The environment reflection half of the specular effect: a two-color
 * procedural sky/ground sampled by the reflected view ray. There is no
 * scene to reflect, so this fakess it.
 */
export interface SpecularEnvironment {
	strength: number;
	skyColor: Color3;
	groundColor: Color3;
	horizon: number;
	fresnel: number;
}

/**
 * Blinn-Phong highlight from the headlight plus an optional procedural
 * environment reflection, applied inside the model shader. In palette
 * style the highlight becomes a chosen palette color with a dithered edge
 * band aka how a pixel artist draws specular. The light is attached to the
 * camera, so highlights track the camera like the shading does.
 */
export class SpecularEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, SPECULAR_DEFAULTS);
	}
}

export interface SpecularEffect extends Required<SpecularOptions> {
	environment: SpecularEnvironment;
}

/** Default settings for {@link SpecularEffect}. */
export const SPECULAR_DEFAULTS = deepFreeze<DeepRequired<SpecularOptions>>({
	enabled: false,
	strength: 0.5,
	smoothness: 0.5,
	color: [1, 1, 1],
	anisotropy: 0,
	environment: {
		strength: 0,
		skyColor: [0.62, 0.87, 1],
		groundColor: [0.42, 0.28, 0.2],
		horizon: 0.5,
		fresnel: 0.5,
	},
	style: "palette",
	maskedColors: [],
	nodes: [],
});
