/**
 * Procedural 3D pattern fields, shared between the interior material
 * effect and future procedural backgrounds. Each field maps a point in a
 * pre-scaled 3D space plus a time value to a 0-1 intensity. Callers decide
 * colors and styling.
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
                
                field += (r * r) / max(d2, 1e-4);
            }
        }
    }

    return smoothstep(2.2, 3.2, field);
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

/** Samples a pattern field by id, matching the InteriorPattern order. */
float patternField(int id, vec3 p, float t) {
    if (id == 0) return starsField(p, t);
    if (id == 1) return dustField(p, t);
    if (id == 2) return voronoiField(p, t);
    if (id == 3) return lavaField(p, t);
    
    return gridField(p, t);
}
