/**
 * Texel-level dissolve shared by the model and fur shaders. Computes a
 * 0-1 dissolve coordinate per fragment (low values dissolve first),
 * discards below the progress threshold through the shading
 * checkerboard, and exposes the ember-edge band intensity for the
 * surviving fragments near the cut.
 *
 * Self-contained except for hash13(): the including shader must have
 * included chunks/hash.glsl (directly or via patterns.glsl) beforehand.
 */

#include node-bits.glsl;

uniform bool u_dissolveEnabled;
uniform float u_dissolveProgress; // 0 = intact, 1 = fully dissolved
uniform int u_dissolveMode; // 0 = noise, 1 = directional, 2 = distance
uniform float u_dissolveScale;
uniform vec3 u_dissolveAxis;
uniform float u_dissolveAxisOffset;
uniform vec3 u_dissolvePoint; // world center, camera proximity
uniform float u_dissolveInvRange;
uniform float u_dissolveRangeBias;
uniform float u_dissolveFlipScale;
uniform float u_dissolveFlipOffset;
uniform float u_dissolveSoftness;
uniform float u_dissolveEdgeWidth;
uniform vec3 u_dissolveEdgeColor;
uniform bool u_dissolveSmooth;
uniform int u_dissolveMask;

/** Same bitmask semantics as the material-effect masks (0 = all). */
bool inDissolveMask(float colorIdx) {
    if (u_dissolveMask == 0) return true;
    int idx = int(colorIdx + 0.5);
    return idx < 16 && ((u_dissolveMask >> idx) & 1) != 0;
}

/** The shading system's 2x2 checkerboard as an on/off gate. */
bool dissolveDither(float t) {
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    return t > (checker < 0.5 ? 0.25 : 0.75);
}

/** The fragment's 0-1 dissolve coordinate. */
float dissolveValue(vec3 worldPos, vec3 meshPos) {
    float v;
    if (u_dissolveMode == 0) {
        // Mesh-space cells stay glued under node animation and deform
        v = hash13(floor(meshPos * u_dissolveScale) + 17.17);
    } else if (u_dissolveMode == 1) {
        v = dot(worldPos, u_dissolveAxis) + u_dissolveAxisOffset;
    } else {
        v = length(worldPos - u_dissolvePoint) * u_dissolveInvRange
            + u_dissolveRangeBias;
    }
    return v * u_dissolveFlipScale + u_dissolveFlipOffset;
}

/**
 * Discards dissolved fragments and returns the edge-band intensity for
 * the survivors (0 outside the band). Call before shading, so the
 * discard also keeps depth and the index G-buffer clean. 
 * The threshold overshoots by the softness band so
 * progress 1 removes every fragment, dither band included.
 */
float applyDissolveCutout(float colorIdx, vec3 worldPos, vec3 meshPos) {
    if (!u_dissolveEnabled || !inNodeSet(NODE_DISSOLVE) || !inDissolveMask(colorIdx)) {
        return 0.0;
    }

    float v = dissolveValue(worldPos, meshPos);
    float s = max(u_dissolveSoftness, 0.0001);
    float threshold = clamp(u_dissolveProgress, 0.0, 1.0) * (1.0 + s);
    float t = (v - threshold + s) / s;

    if (!dissolveDither(t)) discard;
    if (u_dissolveEdgeWidth <= 0.0) return 0.0;

    return clamp(1.0 - (v - threshold) / u_dissolveEdgeWidth, 0.0, 1.0);
}

/** Paints the dissolve edge over the final color. */
vec3 applyDissolveEdge(vec3 color, float edge) {
    if (edge <= 0.0) return color;
    if (u_dissolveSmooth) return mix(color, u_dissolveEdgeColor, edge);
    return dissolveDither(edge) ? u_dissolveEdgeColor : color;
}
