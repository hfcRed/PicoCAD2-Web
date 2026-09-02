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
    int mode;
    float scale;
    vec3 axis;
    float axisOffset;
    vec3 point;
    float invRange;
    float rangeBias;
    float flipScale;
    float flipOffset;
    float softness;
};

/**
 * The 0-1 sweep coordinate at a position. Noise hashes meshPos so its
 * cells stay glued to the surface under animation and deform, the other
 * modes read worldPos. Uniform mode has no coordinate and returns 0.
 */
float sweepValue(Sweep s, vec3 worldPos, vec3 meshPos) {
    float v;
    if (s.mode == SWEEP_NOISE) {
        v = hash13(floor(meshPos * s.scale) + 17.17);
    } else if (s.mode == SWEEP_DIRECTIONAL) {
        v = dot(worldPos, s.axis) + s.axisOffset;
    } else if (s.mode == SWEEP_DISTANCE) {
        v = length(worldPos - s.point) * s.invRange + s.rangeBias;
    } else {
        return 0.0;
    }
    return v * s.flipScale + s.flipOffset;
}

/**
 * The coordinate the front has reached at a progress. Overshoots by the
 * softness band so progress 1 sweeps every position, band included.
 */
float sweepThreshold(Sweep s, float progress) {
    return progress * (1.0 + max(s.softness, 0.0001));
}

/**
 * The local progress at a position. 0 ahead of the front, 1 behind it,
 * rising across the softness band in between. Uniform mode returns the
 * global progress everywhere.
 */
float sweepProgress(Sweep s, float progress, vec3 worldPos, vec3 meshPos) {
    if (s.mode == SWEEP_UNIFORM) return progress;
    float soft = max(s.softness, 0.0001);
    float v = sweepValue(s, worldPos, meshPos);
    return clamp((sweepThreshold(s, progress) - v) / soft, 0.0, 1.0);
}
