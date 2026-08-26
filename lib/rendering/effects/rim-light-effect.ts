import type { Color3 } from "../../types/scene.ts";
import type { MaterialStyle } from "./material-style.ts";

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
	enabled = false;
	color: Color3 = [1, 1, 1];
	width = 0.35;
	sharpness = 0.7;
	lightAlign = 0;
	blend = 1;
	invert = false;
	style: MaterialStyle = "palette";
	maskedColors: number[] = [];
}
