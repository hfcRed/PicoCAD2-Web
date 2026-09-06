import type { WorldBounds } from "../../scene/scene-graph.ts";
import type {
	CycleOptions,
	SweepOptions,
	VertexGlitchOptions,
} from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import { packColorMask } from "./color-mask.ts";
import { CYCLE_DEFAULTS, type CyclePhase } from "./cycle.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import {
	createSweepUniforms,
	type SweepUniforms,
	writeSweepUniforms,
} from "./sweep.ts";

export type VertexGlitchUnit = "triangle" | "vertex";

/**
 * Rhythmic mesh spikes in the vertex stage. Time is cut into beats at
 * {@link rate} per second, every beat picks a {@link density} fraction of
 * units at random, and each picked unit spikes out by {@link strength}
 * for {@link duration} seconds, snapping there or, with {@link softness},
 * easing out and back within the spike.
 *
 * {@link unit} decides what moves. "triangle" pushes whole triangles along
 * their face normal, which tears the mesh apart on purpose and hides the
 * wireframe and fur while it runs. "vertex" pushes every corner at a mesh
 * position outward along the smoothed normal, the average of every face
 * sharing that position, so welds hold and the wireframe and fur follow
 * through the shared vertex chain.
 *
 * {@link progress}, {@link cycle} and the {@link sweep} scale the spikes
 * across the model the way they do for the mesh deform, so a wave runs a
 * band of corruption through it.
 */
export class VertexGlitchEffect {
	constructor() {
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, VERTEX_GLITCH_DEFAULTS);
	}
}

export interface VertexGlitchEffect extends Required<VertexGlitchOptions> {
	cycle: Required<CycleOptions>;
	sweep: Required<SweepOptions>;
}

/** Default settings for {@link VertexGlitchEffect}. */
export const VERTEX_GLITCH_DEFAULTS = deepFreeze<
	DeepRequired<VertexGlitchOptions>
>({
	enabled: false,
	progress: 1,
	cycle: { ...CYCLE_DEFAULTS },
	sweep: {
		mode: "uniform",
		direction: [0, 1, 0],
		point: [0, 0, 0],
		scale: 8,
		softness: 0.15,
		wave: 0,
		invert: false,
	},
	unit: "vertex",
	strength: 0.2,
	rate: 8,
	density: 0.3,
	duration: 0.1,
	softness: 0,
	maskedColors: [],
	nodes: [],
});

export interface VertexGlitchUniforms {
	u_glitchEnabled: boolean;
	u_glitchProgress: number;
	u_glitchSweep: SweepUniforms;
	u_glitchUnit: number;
	u_glitchStrength: number;
	u_glitchRate: number;
	u_glitchDensity: number;
	u_glitchDuration: number;
	u_glitchSoftness: number;
	u_glitchMask: number;
}

/**
 * Creates the glitch uniforms in their resting state, for every program
 * that includes the glitch chunk.
 *
 * @returns The uniforms, glitch disabled.
 */
export function createVertexGlitchUniforms(): VertexGlitchUniforms {
	return {
		u_glitchEnabled: false,
		u_glitchProgress: 1,
		u_glitchSweep: createSweepUniforms(),
		u_glitchUnit: 0,
		u_glitchStrength: 0,
		u_glitchRate: 8,
		u_glitchDensity: 0,
		u_glitchDuration: 0,
		u_glitchSoftness: 0,
		u_glitchMask: 0,
	};
}

/**
 * Maps the glitch settings onto shader uniforms. Used by the renderer for
 * the model and fur programs and by the wireframe effect, so every program
 * spikes the same units the same way.
 *
 * @param u - The uniform object to write into.
 * @param glitch - The glitch settings, or null for a no-op.
 * @param active - Whether the glitch touches the model this frame, from
 *   the renderer's sweep gate.
 * @param phase - The glitch's phase this frame, after its cycle.
 * @param bounds - The model's rest-pose world bounds.
 * @param cameraPos - The camera's world position, for a proximity sweep.
 */
export function writeVertexGlitchUniforms(
	u: VertexGlitchUniforms,
	glitch: VertexGlitchEffect | null,
	active: boolean,
	phase: CyclePhase,
	bounds: WorldBounds,
	cameraPos: Color3,
): void {
	u.u_glitchEnabled = active;
	if (!glitch || !active) return;

	u.u_glitchProgress = Math.min(Math.max(phase.progress, 0), 1);
	writeSweepUniforms(u.u_glitchSweep, glitch.sweep, phase, bounds, cameraPos);
	u.u_glitchUnit = glitch.unit === "vertex" ? 1 : 0;
	u.u_glitchStrength = glitch.strength;
	u.u_glitchRate = Math.max(glitch.rate, 0);
	u.u_glitchDensity = Math.min(Math.max(glitch.density, 0), 1);
	u.u_glitchDuration = Math.max(glitch.duration, 0);
	u.u_glitchSoftness = Math.min(Math.max(glitch.softness, 0), 1);
	u.u_glitchMask = packColorMask(glitch.maskedColors);
}
