/**
 * The interior's and the projection's patterns are decided per program
 * variant, one FX_INTERIOR_PATTERN_<NAME> and one FX_PROJECTION_PATTERN_<NAME>
 * define each, so a variant drawn while the wanted one still compiles
 * shows the patterns it was built for and the pattern library compiles
 * only the fields in use. Their union selects the fields, and
 * INTERIOR_PATTERN and PROJECTION_PATTERN are the ids the material effects
 * sample with.
 */

#if defined(FX_INTERIOR_PATTERN_STARS) || defined(FX_PROJECTION_PATTERN_STARS)
#define FX_PATTERN_STARS 1
#endif
#if defined(FX_INTERIOR_PATTERN_DUST) || defined(FX_PROJECTION_PATTERN_DUST)
#define FX_PATTERN_DUST 1
#endif
#if defined(FX_INTERIOR_PATTERN_VORONOI) || defined(FX_PROJECTION_PATTERN_VORONOI)
#define FX_PATTERN_VORONOI 1
#endif
#if defined(FX_INTERIOR_PATTERN_LAVA) || defined(FX_PROJECTION_PATTERN_LAVA)
#define FX_PATTERN_LAVA 1
#endif
#if defined(FX_INTERIOR_PATTERN_GRID) || defined(FX_PROJECTION_PATTERN_GRID)
#define FX_PATTERN_GRID 1
#endif
#if defined(FX_INTERIOR_PATTERN_TRUCHET) || defined(FX_PROJECTION_PATTERN_TRUCHET)
#define FX_PATTERN_TRUCHET 1
#endif
#if defined(FX_INTERIOR_PATTERN_CONSTELLATIONS) || defined(FX_PROJECTION_PATTERN_CONSTELLATIONS)
#define FX_PATTERN_CONSTELLATIONS 1
#endif

#if defined(FX_INTERIOR_PATTERN_STARS)
#define INTERIOR_PATTERN 0
#elif defined(FX_INTERIOR_PATTERN_DUST)
#define INTERIOR_PATTERN 1
#elif defined(FX_INTERIOR_PATTERN_VORONOI)
#define INTERIOR_PATTERN 2
#elif defined(FX_INTERIOR_PATTERN_LAVA)
#define INTERIOR_PATTERN 3
#elif defined(FX_INTERIOR_PATTERN_GRID)
#define INTERIOR_PATTERN 4
#elif defined(FX_INTERIOR_PATTERN_TRUCHET)
#define INTERIOR_PATTERN 5
#else
#define INTERIOR_PATTERN 6
#endif

#if defined(FX_PROJECTION_PATTERN_STARS)
#define PROJECTION_PATTERN 0
#elif defined(FX_PROJECTION_PATTERN_DUST)
#define PROJECTION_PATTERN 1
#elif defined(FX_PROJECTION_PATTERN_VORONOI)
#define PROJECTION_PATTERN 2
#elif defined(FX_PROJECTION_PATTERN_LAVA)
#define PROJECTION_PATTERN 3
#elif defined(FX_PROJECTION_PATTERN_GRID)
#define PROJECTION_PATTERN 4
#elif defined(FX_PROJECTION_PATTERN_TRUCHET)
#define PROJECTION_PATTERN 5
#else
#define PROJECTION_PATTERN 6
#endif
