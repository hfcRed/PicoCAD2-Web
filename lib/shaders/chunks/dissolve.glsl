/**
 * Texel-level dissolve shared by the model and fur shaders. Runs the
 * dissolve's sweep at each fragment, discards behind the front through
 * the shading checkerboard, and exposes the ember-edge band intensity for
 * the surviving fragments near the cut.
 */

#include node-bits.glsl;
#include sweep.glsl;

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

/** The shading system's 2x2 checkerboard as an on/off gate. */
bool dissolveDither(float t) {
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    return t > (checker < 0.5 ? 0.25 : 0.75);
}

/**
 * Discards dissolved fragments and returns the edge-band intensity for
 * the survivors (0 outside the band). Call before shading, so the
 * discard also keeps depth and the index G-buffer clean. A uniform sweep
 * fades the whole surface through the checkerboard and has no edge.
 */
float applyDissolveCutout(float colorIdx, vec3 worldPos, vec3 meshPos) {
    if (!u_dissolveEnabled || !inNodeSet(NODE_DISSOLVE) || !inDissolveMask(colorIdx)) {
        return 0.0;
    }

    float progress = clamp(u_dissolveProgress, 0.0, 1.0);
    float local = sweepProgress(u_dissolveSweep, progress, worldPos, meshPos);
    if (!dissolveDither(1.0 - local)) discard;
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
    return dissolveDither(edge) ? u_dissolveEdgeColor : color;
}
