/**
 * Palette swap and color cycling, PICO-8 `pal()` style.
 *
 * Rewrites the model's 16x3 palette LUT on the CPU, so every consumer of the
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
 * This is a CPU-side effect applied by the renderer, not a shader pass.
 */
export class PaletteSwapEffect {
	enabled = false;
	map: number[] = [];
	cycleIndices: number[] = [];
	cycleSpeed = 2;

	/**
	 * Computes the effective 16-entry display remap for a point in time.
	 *
	 * @param time - Elapsed time in seconds.
	 * @returns The remap array (identity entries included).
	 */
	resolveRemap(time: number): number[] {
		const remap: number[] = [];
		for (let i = 0; i < 16; i++) {
			const m = this.map[i];
			remap[i] = Number.isInteger(m) && m >= 0 && m < 16 ? m : i;
		}

		const cycle = this.cycleIndices.filter(
			(i) => Number.isInteger(i) && i >= 0 && i < 16,
		);
		if (cycle.length > 1 && this.cycleSpeed !== 0) {
			const step = Math.floor(time * this.cycleSpeed);
			const n = cycle.length;
			for (let i = 0; i < 16; i++) {
				const pos = cycle.indexOf(remap[i]);
				if (pos >= 0) {
					remap[i] = cycle[(((pos + step) % n) + n) % n];
				}
			}
		}

		return remap;
	}
}
