import type { Color3 } from "../../types/scene.ts";
import type { MaterialStyle } from "./material-style.ts";

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
	enabled = false;
	strength = 0.5;
	smoothness = 0.5;
	color: Color3 = [1, 1, 1];
	anisotropy = 0;
	environment: SpecularEnvironment = {
		strength: 0,
		skyColor: [0.62, 0.87, 1],
		groundColor: [0.42, 0.28, 0.2],
		horizon: 0.5,
		fresnel: 0.5,
	};
	style: MaterialStyle = "palette";
	maskedColors: number[] = [];
}
