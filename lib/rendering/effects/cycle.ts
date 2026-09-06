import type { CycleOptions } from "../../types/options.ts";
import { type DeepRequired, deepFreeze } from "./effect-defaults.ts";

export type CycleMode = "pingpong" | "loop";

export const CYCLE_DEFAULTS = deepFreeze<DeepRequired<CycleOptions>>({
	enabled: false,
	mode: "pingpong",
	duration: 4,
	hold: 0.5,
});

/**
 * Where an effect's progress stands this frame, after its cycle. A loop
 * cycle restores the model on a returning pass that travels the sweep the
 * same way as the first, so the sweep runs that pass inverted with the
 * progress rising from 0 again instead of falling back from 1.
 */
export interface CyclePhase {
	progress: number;
	returning: boolean;
}

/**
 * Resolves the phase an effect renders with this frame.
 *
 * With the cycle disabled this is the manual `progress`. Otherwise the
 * progress follows the elapsed time. It rests at 0 for `hold` seconds,
 * rises to 1, rests there for another `hold`, and comes back, all within
 * one `duration`. A ping-pong cycle comes back by falling from 1 to 0, so
 * the sweep retraces its path. A loop cycle comes back on a returning
 * pass whose progress rises from 0 to 1 again, so the sweep runs forward
 * a second time and restores what the first pass swept. A hold of half
 * the duration or more turns the cycle into a square wave that flips
 * between the two rest states.
 *
 * @param out - The phase to write.
 * @param progress - The effect's manual progress.
 * @param cycle - The effect's cycle settings.
 * @param time - Elapsed time in seconds.
 */
export function resolveCyclePhase(
	out: CyclePhase,
	progress: number,
	cycle: CycleOptions | undefined,
	time: number,
): void {
	out.returning = false;
	if (!cycle?.enabled) {
		out.progress = progress;
		return;
	}

	const duration = Math.max(cycle.duration ?? CYCLE_DEFAULTS.duration, 1e-3);
	const hold = Math.min(
		Math.max(cycle.hold ?? CYCLE_DEFAULTS.hold, 0),
		duration / 2,
	);
	const travel = (duration - 2 * hold) / 2;

	let t = time % duration;
	if (t < 0) t += duration;

	if (t < hold) {
		out.progress = 0;
		return;
	}
	t -= hold;
	if (t < travel) {
		out.progress = t / travel;
		return;
	}
	t -= travel;
	if (t < hold) {
		out.progress = 1;
		return;
	}
	t -= hold;

	const back = travel > 0 ? t / travel : 1;
	if (cycle.mode === "loop") {
		out.returning = true;
		out.progress = back;
		return;
	}
	out.progress = 1 - back;
}
