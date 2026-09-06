/**
 * Texel-level dissolve shared by the model and fur shaders. Runs the
 * dissolve's sweep at each fragment, discards behind the front through
 * the shading checkerboard or fades it with the smooth transparency's
 * passes, and exposes the ember-edge band intensity for the surviving
 * fragments near the cut.
 */

#include node-bits.glsl;
#include sweep.glsl;
#include transparency.glsl;

uniform bool u_dissolveEnabled;
uniform float u_dissolveProgress; // 0 = intact, 1 = fully dissolved
uniform Sweep u_dissolveSweep;
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

/**
 * Discards dissolved fragments and returns the edge-band intensity for
 * the survivors (0 outside the band), with the fade's remaining coverage
 * for the index buffer in the out parameter. Call before shading, so the
 * discard also keeps depth and the index G-buffer clean. Dithered, the
 * checkerboard decides per fragment. Smooth transparency splits the model
 * into an opaque pass that keeps the untouched fragments and a blended
 * pass that keeps the fading ones with their coverage as alpha. A uniform
 * sweep fades the whole surface at once and has no edge.
 */
float applyDissolveCutout(float colorIdx, vec3 worldPos, vec3 meshPos, out float coverage) {
    coverage = 1.0;
    if (!u_dissolveEnabled || !inNodeSet(NODE_DISSOLVE) || !inDissolveMask(colorIdx)) {
        if (u_fadePass == FADE_BLENDED) discard;
        return 0.0;
    }

    float progress = clamp(u_dissolveProgress, 0.0, 1.0);
    float remaining = 1.0 - sweepProgress(u_dissolveSweep, progress, worldPos, meshPos);
    if (u_fadePass == FADE_DITHERED) {
        if (!checkerGate(remaining)) discard;
    } else if (u_fadePass == FADE_OPAQUE) {
        if (remaining < FADE_OPAQUE_MIN) discard;
    } else if (remaining < FADE_MIN || remaining >= FADE_OPAQUE_MIN) {
        discard;
    }
    coverage = remaining;
    if (u_dissolveEdgeWidth <= 0.0 || u_dissolveSweep.mode == SWEEP_UNIFORM) {
        return 0.0;
    }

    float d = sweepDistance(u_dissolveSweep, progress, worldPos, meshPos);
    return clamp(1.0 - d / u_dissolveEdgeWidth, 0.0, 1.0);
}

/** Paints the dissolve edge over the final color. */
vec3 applyDissolveEdge(vec3 color, float edge) {
    if (edge <= 0.0) return color;
    if (u_dissolveSmooth) return mix(color, u_dissolveEdgeColor, edge);
    return checkerGate(edge) ? u_dissolveEdgeColor : color;
}
