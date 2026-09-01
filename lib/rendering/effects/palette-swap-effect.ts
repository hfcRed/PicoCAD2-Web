import type { MaterialStyle } from "./material-style.ts";

/**
 * Palette swap and color cycling, PICO-8 `pal()` style.
 *
 * Rewrites the model's palette LUT on the CPU, so every consumer of the
 * palette, like the model shader (including shade rows), particles, and
 * palette-style post effects like SSAO, sees the swapped colors. A swapped
 * index renders with the target color *and* the target's shade ramp, so
 * recolored materials keep correct shading. Effect masks keep matching the
 * base palette index, which the swap does not change.
 *
 * `map` is a sparse display remap: `map[i] = j` renders palette index i with
 * color j (entries left undefined stay identity). `cycleIndices` rotate
 * through each other at `cycleSpeed` steps per second, applied on top of the
 * map, for color cycling.
 *
 * `cycleStyle` controls how each cycle step arrives, blending toward the
 * next colors over the last `cycleBlendTime` seconds of a step. `"dithered"`
 * (default) flips pixels through an ordered dither pattern, `"smooth"`
 * crossfades the palette RGB, and `"palette"` snaps instantly. The blend
 * window is clamped to the step duration, so a long `cycleBlendTime` morphs
 * continuously.
 *
 * This is a CPU-side effect applied by the renderer, not a shader pass.
 */
export class PaletteSwapEffect {
	enabled = false;
	map: number[] = [];
	cycleIndices: number[] = [];
	cycleSpeed = 2;
	cycleStyle: MaterialStyle = "dithered";
	cycleBlendTime = 0.2;

	/**
	 * Computes the effective 16-entry display remaps for a point in time.
	 * The current remap, the remap of the upcoming cycle step, and how far
	 * the blend toward it has progressed (0 outside the blend window).
	 *
	 * @param time - Elapsed time in seconds.
	 * @returns The current and upcoming remaps and the blend progress.
	 */
	resolveCycle(time: number): {
		remap: number[];
		target: number[];
		blend: number;
	} {
		const remap: number[] = [];
		for (let i = 0; i < 16; i++) {
			const m = this.map[i];
			remap[i] = Number.isInteger(m) && m >= 0 && m < 16 ? m : i;
		}

		const cycle = this.cycleIndices.filter(
			(i) => Number.isInteger(i) && i >= 0 && i < 16,
		);
		if (cycle.length < 2 || this.cycleSpeed === 0) {
			return { remap, target: remap, blend: 0 };
		}

		const phase = time * this.cycleSpeed;
		const step = Math.floor(phase);
		const dir = this.cycleSpeed > 0 ? 1 : -1;
		const n = cycle.length;

		const rotate = (steps: number): number[] => {
			const out: number[] = [];
			for (let i = 0; i < 16; i++) {
				const pos = cycle.indexOf(remap[i]);
				out[i] = pos >= 0 ? cycle[(((pos + steps) % n) + n) % n] : remap[i];
			}
			return out;
		};

		const current = rotate(step);
		const target = rotate(step + dir);

		// Blend toward the next step during the final cycleBlendTime seconds
		// of the current one.
		const stepDuration = 1 / Math.abs(this.cycleSpeed);
		const blendTime = Math.min(Math.max(this.cycleBlendTime, 0), stepDuration);
		let blend = 0;
		if (blendTime > 0 && this.cycleStyle !== "palette") {
			const frac = phase - step;
			const timeToFlip = (dir > 0 ? 1 - frac : frac) * stepDuration;
			blend = Math.min(Math.max(1 - timeToFlip / blendTime, 0), 1);
		}

		return { remap: current, target, blend };
	}
}
