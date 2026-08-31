/**
 * Shared color utilities. Included by patterns.glsl, so shaders that pull
 * in the pattern library must not include this chunk directly
 * (vite-plugin-glsl does not dedupe includes).
 */

/** Rotates a color's hue by an angle in radians (around the gray axis). */
vec3 hueRotate(vec3 c, float angle) {
    const vec3 k = vec3(0.57735026919);
    float cosA = cos(angle);
    return c * cosA + cross(k, c) * sin(angle) + k * dot(k, c) * (1.0 - cosA);
}
