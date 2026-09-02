import type { CycleOptions } from "../../types/options.ts";
import { type DeepRequired, deepFreeze } from "./effect-defaults.ts";

export const CYCLE_DEFAULTS = deepFreeze<DeepRequired<CycleOptions>>({
	enabled: false,
	duration: 4,
	hold: 0.5,
});

/**
 * Resolves the progress an effect renders with this frame.
 *
 * With the cycle disabled this is the manual `progress`. Otherwise the
 * progress follows a triangle wave of the elapsed time. It rests at 0 for
 * `hold` seconds, rises to 1, rests there for another `hold`, and falls
 * back, all within one `duration`. A hold of half the duration or more
 * turns the cycle into a square wave that flips between the two rest
 * states.
 *
 * @param progress - The effect's manual progress.
 * @param cycle - The effect's cycle settings.
 * @param time - Elapsed time in seconds.
 * @returns The progress to render with, 0-1.
 */
export function resolveCycleProgress(
	progress: number,
	cycle: CycleOptions | undefined,
	time: number,
): number {
	if (!cycle?.enabled) return progress;

	const duration = Math.max(cycle.duration ?? CYCLE_DEFAULTS.duration, 1e-3);
	const hold = Math.min(
		Math.max(cycle.hold ?? CYCLE_DEFAULTS.hold, 0),
		duration / 2,
	);
	const travel = (duration - 2 * hold) / 2;

	let t = time % duration;
	if (t < 0) t += duration;

	if (t < hold) return 0;
	t -= hold;
	if (t < travel) return t / travel;
	t -= travel;
	if (t < hold) return 1;
	t -= hold;
	return travel > 0 ? 1 - t / travel : 0;
}
