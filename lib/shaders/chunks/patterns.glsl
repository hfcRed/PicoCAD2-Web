/**
 * Procedural pattern fields, shared between the interior material effect
 * and the procedural background, both expose the full library through
 * patternField(id, p, t). Each field maps a point in a pre-scaled 3D
 * space plus a time value to a 0-1 intensity. Callers decide colors and
 * styling. The 2D fields (truchet, constellations) read p.xy with the z
 * cell as a variant/reseed.
 *
 * Fields also report a per-feature random in 0-1 (stable for the star,
 * blob, tile or edge the pixel belongs to, 0.5 = neutral) through the
 * five-argument patternField overload, which consumers can turn into
 * per-feature hue rotation with hueRotate().
 *
 * A program carries only the fields it defines FX_PATTERN_<NAME> for,
 * see patternField.
 */

#include hash.glsl;
#include color.glsl;

const float PATTERN_TAU = 6.28318530718;

/*
 * A consumer compiled with a single pattern reads its id from
 * PATTERN_ONLY_ID, the lowest field it defined, so a program drawn while
 * another variant still compiles shows the pattern it was built for.
 */
#if defined(FX_PATTERN_STARS)
#define PATTERN_ONLY_ID 0
#elif defined(FX_PATTERN_DUST)
#define PATTERN_ONLY_ID 1
#elif defined(FX_PATTERN_VORONOI)
#define PATTERN_ONLY_ID 2
#elif defined(FX_PATTERN_LAVA)
#define PATTERN_ONLY_ID 3
#elif defined(FX_PATTERN_GRID)
#define PATTERN_ONLY_ID 4
#elif defined(FX_PATTERN_TRUCHET)
#define PATTERN_ONLY_ID 5
#else
#define PATTERN_ONLY_ID 6
#endif

/**
 * Tiny twinkling points, one per hashed cell. Centers stay a radius away
 * from the cell borders so points never clip against them. Size,
 * brightness and twinkle speed vary per star. The twinkle breathes the
 * star's size a little and reaches 0, so stars fully disappear at their
 * dimmest.
 */
float starsField(vec3 p, float t, out float rand) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    vec4 h = hash43(cell);
    vec3 h2 = hash33(cell + 47.0);
    rand = h2.z;

    float speed = 0.6 + 0.8 * h2.x;
    float tw = 0.5 + 0.5 * sin(PATTERN_TAU * (h.w + t * speed));

    // Center placement reserves the maximum pulsed radius so the size
    // breathing never clips against the cell borders.
    float radius = mix(0.2, 0.35, h.w);
    vec3 center = mix(vec3(radius * 1.1), vec3(1.0 - radius * 1.1), h.xyz);
    radius *= mix(0.85, 1.1, tw);
    float d = length(local - center) / radius;

    if (d >= 1.0) return 0.0;

    // A bright plateau with a thin falloff shell. Point-sampling a 3D field
    // only ever hits a sphere's cross-section, so the intensity must stay
    // high across most of the sphere for stars to survive the dither gate.
    float core = 1.0 - smoothstep(0.6, 1.0, d);
    float brightness = mix(0.7, 1.0, h2.y);

    return core * tw * brightness;
}

/** Sparse soft motes of varying size and brightness drifting through space. */
float dustField(vec3 p, float t, out float rand) {
    p += vec3(0.35, 0.2, 0.27) * t;

    vec3 cell = floor(p);
    vec3 local = fract(p);
    vec4 h = hash43(cell);
    vec3 h2 = hash33(cell + 47.0);
    rand = h2.z;

    if (h.w < 0.3) return 0.0;

    float radius = mix(0.25, 0.5, h2.x);
    vec3 center = mix(vec3(radius), vec3(1.0 - radius), h.xyz);
    float d = length(local - center) / radius;

    if (d >= 1.0) return 0.0;

    // Capped below 0.75 so palette style renders motes as checkered dither.
    return (1.0 - smoothstep(0.4, 1.0, d)) * mix(0.45, 0.7, h2.y);
}

/**
 * Glowing borders between slowly shifting 3D voronoi cells. The feature
 * rand hashes the unordered pair of cells an edge separates, so a whole
 * edge shares one value with no seam along the ridge.
 */
float voronoiField(vec3 p, float t, out float rand) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    vec3 n1 = cell;
    vec3 n2 = cell;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            for (int z = -1; z <= 1; z++) {
                vec3 off = vec3(float(x), float(y), float(z));
                vec3 h = hash33(cell + off);
                vec3 point = off + 0.5 + 0.35 * sin(PATTERN_TAU * h + t);
                float d = length(point - local);

                if (d < f1) {
                    f2 = f1;
                    n2 = n1;
                    f1 = d;
                    n1 = cell + off;
                } else if (d < f2) {
                    f2 = d;
                    n2 = cell + off;
                }
            }
        }
    }

    rand = hash13(n1 + n2 + 53.0);
    return 1.0 - smoothstep(0.02, 0.2, f2 - f1);
}

/**
 * Blobby metaballs merging and splitting, lava-lamp style. The feature
 * rand is the contribution-weighted average of the balls' randoms, so
 * merged blobs blend their values smoothly.
 */
float lavaField(vec3 p, float t, out float rand) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    float field = 0.0;
    float weighted = 0.0;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            for (int z = -1; z <= 1; z++) {
                vec3 off = vec3(float(x), float(y), float(z));
                vec3 h = hash33(cell + off);
                vec3 center =
                    off + 0.5 + 0.35 * sin(PATTERN_TAU * h + t * (1.0 + h.x));
                float r = mix(0.2, 0.45, h.y);
                float d2 = dot(center - local, center - local);

                // Wyvill kernel with compact support. Reaches exactly 0 at
                // 2.44r <= 1.10, inside the scanned neighborhood's
                // guaranteed 1.15 coverage radius, so balls outside the
                // 3x3x3 window contribute nothing and the field stays
                // continuous across cells.
                float s = 1.0 - min(d2 / (5.97 * r * r), 1.0);
                float c = s * s * s;
                field += c;
                weighted += c * hash13(cell + off + 61.0);
            }
        }
    }

    rand = field > 1e-4 ? weighted / field : 0.5;

    return smoothstep(0.36, 0.83, field);
}

/** Glowing edges of a scrolling cubic lattice. Uniform, no feature rand. */
float gridField(vec3 p, float t) {
    p.z += t * 0.3;

    vec3 a = vec3(0.5) - abs(fract(p) - vec3(0.5));
    float mn = min(a.x, min(a.y, a.z));
    float mx = max(a.x, max(a.y, a.z));
    float mid = a.x + a.y + a.z - mn - mx;

    return 1.0 - smoothstep(0.03, 0.12, max(mn, mid));
}

/**
 * Interlocking quarter-circle tiles. A 2D field reads p.xy, with the z
 * cell selecting the tile-flip variant. The feature rand is per tile.
 */
float truchetField(vec3 p, float t, out float rand) {
    p.xy += t * 0.1;

    vec2 cell = floor(p.xy);
    vec2 local = fract(p.xy);
    rand = hash13(vec3(cell, floor(p.z)) + 43.0);

    if (hash13(vec3(cell, floor(p.z))) < 0.5) local.x = 1.0 - local.x;

    float d = min(
        abs(length(local) - 0.5),
        abs(length(local - 1.0) - 0.5)
    );

    return 1.0 - smoothstep(0.04, 0.11, d);
}

const float MAX_CONNECTIONS = 3.0;

/**
 * The gate of the connection from a cell toward a neighbor offset. The
 * hash of the unordered cell pair, so both endpoints and every cell a
 * segment crosses derive the identical value.
 */
float connectionGate(vec2 cell, vec2 delta, float z, float period) {
    vec2 pair = cell * 2.0 + delta;
    if (period > 0.0) pair.x = mod(pair.x, period * 2.0);
    return hash13(vec3(pair, z + 7.0));
}

/**
 * The third-strongest of a cell's eight connection gates. A connection
 * is accepted by a star when fewer than MAX_CONNECTIONS of its gates are
 * stronger, which is the same as the connection's gate reaching this
 * threshold, and a line only exists when both endpoint stars accept it.
 * Hashed once per cell of the neighborhood, counting the stronger gates
 * per line instead, for both endpoints, re-hashed the same gates sixteen
 * times per line and made the field cost most of a second to compile.
 */
float acceptThreshold(vec2 cell, float z, float period) {
    float s1 = -1.0;
    float s2 = -1.0;
    float s3 = -1.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;
            float g = connectionGate(cell, vec2(float(x), float(y)), z, period);
            // Branchless insertion into the sorted top three.
            float d1 = min(g, s1);
            s1 = max(g, s1);
            float d2 = min(d1, s2);
            s2 = max(d1, s2);
            s3 = max(d2, s3);
        }
    }
    return s3;
}

/**
 * Evaluates one constellation line between two stars against the
 * pixel's local point, given the connection's gate and the acceptance
 * thresholds of both endpoint cells. Returns the line intensity at the
 * point; lrand is its feature rand.
 */
float constellationLine(
    vec2 local,
    vec2 starA,
    vec2 starB,
    float gate,
    float acceptA,
    float acceptB,
    float t,
    out float lrand
) {
    lrand = 0.5;
    if (gate < 0.5) return 0.0;

    const float MIN_LINE_DIST = 1.0;
    vec2 ab = starB - starA;
    if (dot(ab, ab) < MIN_LINE_DIST * MIN_LINE_DIST) return 0.0;
    if (gate < acceptA || gate < acceptB) return 0.0;

    float gr = (gate - 0.5) * 2.0;
    float width = mix(0.6, 1.6, fract(gr * 7.13));
    float lineSpeed = 0.5 + 0.9 * fract(gr * 3.71);
    float flicker = 0.5 + 0.5 * sin(PATTERN_TAU * (gr * 11.0 + t * lineSpeed));
    lrand = fract(gr * 5.23);

    float seg = clamp(dot(local - starA, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
    float dl = length(local - (starA + ab * seg));
    return (1.0 - smoothstep(0.005 * width, 0.03 * width, dl)) * 0.28 * flicker;
}

/**
 * Twinkling star points connected to some of their neighbors by faint
 * lines. A 2D field: reads p.xy, with the z cell reseeding the sky.
 * The connection gate hashes the unordered cell pair, so every cell a
 * segment crosses agrees on whether it exists.
 *
 * Star size, line width, and the flicker phase and speed of both are
 * random per feature. Stars keep a brightness floor and breathe their
 * size with the flicker, line flicker reaches 0 so connections
 * fade fully to the background at their dimmest. Connections only form
 * between stars at least MIN_LINE_DIST apart, and each star accepts at
 * most its MAX_CONNECTIONS strongest gates. The feature rand follows
 * whichever star or line wins the pixel.
 *
 * Besides the eight own-star connections, each pixel also evaluates the
 * four diagonal connections between its orthogonal neighbors. Those
 * segments can cut through this cell's corner without either endpoint
 * being the own star, and skipping them broke lines at cell borders.
 *
 * A period > 0 makes the field periodic every that many whole cells
 * along x. Neighbor cells are hashed modulo the period, so a caller
 * wrapping p.x with mod(p.x, period) gets a seamless cylinder (stars
 * and lines connect across the wrap). 0 = non-periodic.
 */
float constellationsField(vec3 p, float t, float period, out float rand) {
    vec2 cell = floor(p.xy);
    vec2 local = fract(p.xy);
    float z = floor(p.z);
    float intensity = 0.0;
    rand = 0.5;

    // Cache the 3x3 neighborhood's cells, stars and acceptance thresholds,
    // indexed (y + 1) * 3 + (x + 1), and draw the stars. Positions are
    // relative to the own cell.
    vec2 cells[9];
    vec2 stars[9];
    float accept[9];
    for (int i = 0; i < 9; i++) {
        vec2 off = vec2(float(i % 3 - 1), float(i / 3 - 1));
        vec2 nc = cell + off;
        if (period > 0.0) nc.x = mod(nc.x, period);
        vec3 h = hash33(vec3(nc, z));
        cells[i] = nc;
        stars[i] = off + 0.2 + 0.6 * h.xy;
        accept[i] = acceptThreshold(nc, z, period);

        // Flickering size and brightness
        float speed = 0.6 + 0.8 * fract(h.y * 7.31);
        float tw = 0.5 + 0.5 * sin(PATTERN_TAU * (h.z + t * speed));
        float size = mix(0.6, 1.5, fract(h.x * 9.17)) * mix(0.75, 1.1, tw);
        float twinkle = mix(0.35, 1.0, tw);
        float d = length(local - stars[i]);
        float si = (1.0 - smoothstep(0.03 * size, 0.09 * size, d)) * twinkle;
        if (si > intensity) {
            intensity = si;
            rand = fract(h.z * 5.71);
        }
    }

    // Lines from the own star to each neighbor star.
    for (int i = 0; i < 9; i++) {
        if (i == 4) continue;
        vec2 delta = vec2(float(i % 3 - 1), float(i / 3 - 1));
        float gate = connectionGate(cells[4], delta, z, period);
        float lrand;
        float li = constellationLine(
            local, stars[4], stars[i], gate, accept[4], accept[i], t, lrand
        );
        if (li > intensity) {
            intensity = li;
            rand = lrand;
        }
    }

    // Corner-cutting diagonals between orthogonal neighbors.
    // (left,down) (down,right) (right,up) (up,left).
    for (int k = 0; k < 4; k++) {
        int a = k == 0 ? 3 : (k == 1 ? 1 : (k == 2 ? 5 : 7));
        int b = k == 0 ? 1 : (k == 1 ? 5 : (k == 2 ? 7 : 3));
        vec2 offA = vec2(float(a % 3 - 1), float(a / 3 - 1));
        vec2 offB = vec2(float(b % 3 - 1), float(b / 3 - 1));
        float gate = connectionGate(cells[a], offB - offA, z, period);
        float lrand;
        float li = constellationLine(
            local, stars[a], stars[b], gate, accept[a], accept[b], t, lrand
        );
        if (li > intensity) {
            intensity = li;
            rand = lrand;
        }
    }

    return intensity;
}

/**
 * Samples a pattern field by id, matching the InteriorPattern order, and
 * reports the per-feature random (0.5 for the uniform grid).
 * A period > 0 makes the hashed 2D fields periodic every that many whole
 * cells along x (see constellationsField). Grid is 1-periodic and truchet
 * hashes only its own cell, so a caller wrapping p.x needs no help there.
 *
 * Only the fields the program was compiled with are reachable.
 * A consumer defines FX_PATTERN_<NAME> for every pattern it can select
 * and passes compile-time ids, so an id the program was not compiled
 * with never occurs and samples as empty if it did. With the whole
 * library inlined at every sample site a program took most of a second
 * to compile per site, and a program only ever samples the patterns its
 * settings name.
 */
float patternField(int id, vec3 p, float t, float period, out float rand) {
#ifdef FX_PATTERN_STARS
    if (id == 0) return starsField(p, t, rand);
#endif
#ifdef FX_PATTERN_DUST
    if (id == 1) return dustField(p, t, rand);
#endif
#ifdef FX_PATTERN_VORONOI
    if (id == 2) return voronoiField(p, t, rand);
#endif
#ifdef FX_PATTERN_LAVA
    if (id == 3) return lavaField(p, t, rand);
#endif
#ifdef FX_PATTERN_GRID
    if (id == 4) {
        rand = 0.5;
        return gridField(p, t);
    }
#endif
#ifdef FX_PATTERN_TRUCHET
    if (id == 5) return truchetField(p, t, rand);
#endif
#ifdef FX_PATTERN_CONSTELLATIONS
    if (id == 6) return constellationsField(p, t, period, rand);
#endif
    rand = 0.5;
    return 0.0;
}

/** Samples a pattern field by id without the per-feature random. */
float patternField(int id, vec3 p, float t, float period) {
    float rand;
    return patternField(id, p, t, period, rand);
}

/** Samples a non-periodic pattern field by id. */
float patternField(int id, vec3 p, float t) {
    float rand;
    return patternField(id, p, t, 0.0, rand);
}
