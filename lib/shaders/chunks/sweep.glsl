/**
 * Sweep fields, where a progress-driven effect's front sits at a position.
 * Shared by every effect that runs a progress across the model, each with
 * its own Sweep uniform block written by writeSweepUniforms() in sweep.ts,
 * which normalizes the settings to the model's bounds.
 *
 * A sweep maps a position to a 0-1 coordinate, low values sweep first,
 * hashed mesh-space cells (noise), the projection onto a direction
 * (directional) or the distance from a world point (distance, serving
 * both the point and the proximity settings). The uniform mode has no
 * coordinate, the whole model sweeps at once.
 */

#include hash.glsl;

const int SWEEP_UNIFORM = 0;
const int SWEEP_NOISE = 1;
const int SWEEP_DIRECTIONAL = 2;
const int SWEEP_DISTANCE = 3;

struct Sweep {
    highp int mode; // precisions must match
    float scale;
    vec3 axis;
    float axisOffset;
    vec3 point;
    float invRange;
    float rangeBias;
    float softness;
    float wave;
    bool invert;
};

/**
 * The 0-1 sweep coordinate at a position. Noise hashes meshPos so its
 * cells stay glued to the surface under animation and deform, the other
 * modes read worldPos. Uniform mode has no coordinate and returns 0.
 */
float sweepValue(Sweep s, vec3 worldPos, vec3 meshPos) {
    if (s.mode == SWEEP_NOISE) {
        return hash13(floor(meshPos * s.scale) + 17.17);
    }
    if (s.mode == SWEEP_DIRECTIONAL) {
        return dot(worldPos, s.axis) + s.axisOffset;
    }
    if (s.mode == SWEEP_DISTANCE) {
        return length(worldPos - s.point) * s.invRange + s.rangeBias;
    }
    return 0.0;
}

/**
 * The signed distance from the cut at a progress, in sweep units.
 * Positive on the untouched side, negative once swept, with the softness
 * ramp spanning 0 to -softness. A front overshoots by the softness band
 * so progress 1 sweeps every position. A wave is a band as wide as the
 * wave setting that enters at progress 0 and has left at progress 1, with
 * the ramps inside it, so the model restores behind it. Inverting mirrors the cut so the
 * swept and untouched sides swap. Not defined for the uniform mode.
 */
float sweepDistance(Sweep s, float progress, vec3 worldPos, vec3 meshPos) {
    float soft = max(s.softness, 0.0001);
    float v = sweepValue(s, worldPos, meshPos);
    float d;
    if (s.wave > 0.0 && s.mode != SWEEP_NOISE) {
        float halfWidth = s.wave * 0.5;
        float center = progress * (1.0 + s.wave) - halfWidth;
        d = -min(v - (center - halfWidth), (center + halfWidth) - v);
    } else {
        d = v - progress * (1.0 + soft);
    }
    return s.invert ? -d - soft : d;
}

/**
 * The local progress at a position. 0 on the untouched side, 1 once
 * swept, rising across the softness ramp in between. Uniform mode returns
 * the global progress everywhere, inverted when the sweep is.
 */
float sweepProgress(Sweep s, float progress, vec3 worldPos, vec3 meshPos) {
    if (s.mode == SWEEP_UNIFORM) return s.invert ? 1.0 - progress : progress;
    float soft = max(s.softness, 0.0001);
    return clamp(-sweepDistance(s, progress, worldPos, meshPos) / soft, 0.0, 1.0);
}
