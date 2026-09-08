export type PatternName =
	| "stars"
	| "dust"
	| "voronoi"
	| "lava"
	| "grid"
	| "truchet"
	| "constellations";

/**
 * Field ids of the shared pattern library, matching `patternField()` in
 * `chunks/patterns.glsl`. Every effect that samples the library maps its
 * pattern name through this table.
 */
export const PATTERN_ID: Record<PatternName, number> = {
	stars: 0,
	dust: 1,
	voronoi: 2,
	lava: 3,
	grid: 4,
	truchet: 5,
	constellations: 6,
};
