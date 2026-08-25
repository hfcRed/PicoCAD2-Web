/**
 * Packs an array of palette color indices (0-15) into a bitmask for the
 * `u_colorMask`/`u_cutoutMask` shader uniforms. Out-of-range indices are
 * ignored. An empty array packs to 0, which effect masks interpret as
 * "apply to all pixels" and the color cutout interprets as "cut nothing".
 *
 * @param colors - The palette indices to select.
 * @returns The packed bitmask.
 */
export function packColorMask(colors: readonly number[]): number {
	let mask = 0;
	for (const color of colors) {
		if (color >= 0 && color < 16) {
			mask |= 1 << color;
		}
	}
	return mask;
}
