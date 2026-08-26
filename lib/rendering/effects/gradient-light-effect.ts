import type { Color3 } from "../../types/scene.ts";
import type { MaterialStyle } from "./material-style.ts";

export type GradientLightSource = "light" | "worldY" | "screenY";

/**
 * Two-color tint ramp over the model, applied inside the model shader:
 * lit (or high) areas pull toward one color and shadowed (or low) areas
 * toward another like a "cool shadows, warm highlights" grade. In palette
 * style the two colors snap to palette entries and the transition band
 * dithers, so the grade stays in palette.
 */
export class GradientLightEffect {
	enabled = false;
	litColor: Color3 = [1, 0.92, 0.6];
	shadowColor: Color3 = [0.35, 0.35, 0.7];
	source: GradientLightSource = "light";
	blend = 0.5;
	style: MaterialStyle = "palette";
	maskedColors: number[] = [];
}
