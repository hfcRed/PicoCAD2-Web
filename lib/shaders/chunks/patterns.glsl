/**
 * Procedural pattern fields, shared between the interior material effect
 * and the procedural background, both expose the full library through
 * patternField(id, p, t). Each field maps a point in a pre-scaled 3D
 * space plus a time value to a 0-1 intensity. Callers decide colors and
 * styling. The 2D fields (truchet, constellations) read p.xy with the z
 * cell as a variant/reseed.
 *
 * Includes hash.glsl, so this must be the only path through which the hash
 * chunk enters a compilation unit (vite-plugin-glsl does not dedupe).
 */

#include hash.glsl;

const float PATTERN_TAU = 6.28318530718;

/**
 * Tiny twinkling points, one per hashed cell. Centers stay a radius away
 * from the cell borders so points never clip against them.
 */
float starsField(vec3 p, float t) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    vec4 h = hash43(cell);
    float radius = mix(0.2, 0.35, h.w);
    vec3 center = mix(vec3(radius), vec3(1.0 - radius), h.xyz);
    float d = length(local - center) / radius;

    if (d >= 1.0) return 0.0;

    // A bright plateau with a thin falloff shell. Point-sampling a 3D field
    // only ever hits a sphere's cross-section, so the intensity must stay
    // high across most of the sphere for stars to survive the dither gate.
    float core = 1.0 - smoothstep(0.6, 1.0, d);
    float twinkle = 0.65 + 0.35 * sin(PATTERN_TAU * (h.w + t));

    return core * twinkle;
}

/** Sparse soft motes drifting slowly through space. */
float dustField(vec3 p, float t) {
    p += vec3(0.35, 0.2, 0.27) * t;

    vec3 cell = floor(p);
    vec3 local = fract(p);
    vec4 h = hash43(cell);

    if (h.w < 0.3) return 0.0;

    float radius = 0.5;
    vec3 center = mix(vec3(radius), vec3(1.0 - radius), h.xyz);
    float d = length(local - center) / radius;

    if (d >= 1.0) return 0.0;

    // Capped at 0.6 so palette style renders motes as checkered dither.
    return (1.0 - smoothstep(0.4, 1.0, d)) * 0.6;
}

/** Glowing borders between slowly shifting 3D voronoi cells. */
float voronoiField(vec3 p, float t) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            for (int z = -1; z <= 1; z++) {
                vec3 off = vec3(float(x), float(y), float(z));
                vec3 h = hash33(cell + off);
                vec3 point = off + 0.5 + 0.35 * sin(PATTERN_TAU * h + t);
                float d = length(point - local);

                if (d < f1) {
                    f2 = f1;
                    f1 = d;
                } else if (d < f2) {
                    f2 = d;
                }
            }
        }
    }
    return 1.0 - smoothstep(0.02, 0.2, f2 - f1);
}

/** Blobby metaballs merging and splitting, lava-lamp style. */
float lavaField(vec3 p, float t) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    float field = 0.0;

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
                // guaranteed 1.15 coverage radius, so the field stays
                // continuous across cells.
                float s = 1.0 - min(d2 / (5.97 * r * r), 1.0);
                field += s * s * s;
            }
        }
    }

    return smoothstep(0.36, 0.83, field);
}

/** Glowing edges of a scrolling cubic lattice. */
float gridField(vec3 p, float t) {
    p.z += t * 0.3;

    vec3 a = vec3(0.5) - abs(fract(p) - vec3(0.5));
    float mn = min(a.x, min(a.y, a.z));
    float mx = max(a.x, max(a.y, a.z));
    float mid = a.x + a.y + a.z - mn - mx;

    return 1.0 - smoothstep(0.03, 0.12, max(mn, mid));
}

/**
 * Interlocking quarter-circle tiles. A 2D field reads p.xy, with the z cell selecting the tile-flip variant.
 */
float truchetField(vec3 p, float t) {
    p.xy += t * 0.1;

    vec2 cell = floor(p.xy);
    vec2 local = fract(p.xy);

    if (hash13(vec3(cell, floor(p.z))) < 0.5) local.x = 1.0 - local.x;

    float d = min(
        abs(length(local) - 0.5),
        abs(length(local - 1.0) - 0.5)
    );

    return 1.0 - smoothstep(0.04, 0.11, d);
}

/**
 * Twinkling star points connected to some of their neighbors by faint
 * lines. A 2D field: reads p.xy, with the z cell reseeding the sky.
 * The connection gate hashes the unordered cell pair, so both cells a
 * segment crosses agree on whether it exists.
 *
 * A period > 0 makes the field periodic every that many whole cells
 * along x. Neighbor cells are hashed modulo the period, so a caller
 * wrapping p.x with mod(p.x, period) gets a seamless cylinder (stars
 * and lines connect across the wrap). 0 = non-periodic.
 */
float constellationsField(vec3 p, float t, float period) {
    vec2 cell = floor(p.xy);
    vec2 local = fract(p.xy);
    float z = floor(p.z);
    float intensity = 0.0;

    vec3 c0 = hash33(vec3(cell, z));
    vec2 star0 = 0.2 + 0.6 * c0.xy;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 off = vec2(float(x), float(y));
            vec2 nc = cell + off;
            if (period > 0.0) nc.x = mod(nc.x, period);
            vec3 h = hash33(vec3(nc, z));
            vec2 star = off + 0.2 + 0.6 * h.xy;

            float d = length(local - star);
            float twinkle = 0.7 + 0.3 * sin(PATTERN_TAU * (h.z + t));
            intensity = max(intensity, (1.0 - smoothstep(0.03, 0.09, d)) * twinkle);

            if (x == 0 && y == 0) continue;

            vec2 pair = cell * 2.0 + off;
            if (period > 0.0) pair.x = mod(pair.x, period * 2.0);
            float gate = hash13(vec3(pair, z + 7.0));
            if (gate < 0.5) continue;

            vec2 ab = star - star0;
            float seg = clamp(
                dot(local - star0, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0
            );
            float dl = length(local - (star0 + ab * seg));
            intensity = max(intensity, (1.0 - smoothstep(0.005, 0.03, dl)) * 0.45);
        }
    }

    return intensity;
}

/**
 * Samples a pattern field by id, matching the InteriorPattern order.
 * A period > 0 makes the hashed 2D fields periodic every that many whole
 * cells along x (see constellationsField). Grid is 1-periodic and truchet
 * hashes only its own cell, so a caller wrapping p.x needs no help there.
 */
float patternField(int id, vec3 p, float t, float period) {
    if (id == 0) return starsField(p, t);
    if (id == 1) return dustField(p, t);
    if (id == 2) return voronoiField(p, t);
    if (id == 3) return lavaField(p, t);
    if (id == 4) return gridField(p, t);
    if (id == 5) return truchetField(p, t);

    return constellationsField(p, t, period);
}

/** Samples a non-periodic pattern field by id. */
float patternField(int id, vec3 p, float t) {
    return patternField(id, p, t, 0.0);
}
