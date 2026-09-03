/**
 * Vertex glitch, rhythmic mesh spikes. Time is cut into beats, every beat
 * picks a random fraction of units, and each picked unit spikes out for
 * the spike duration, scaled by the local progress of the glitch's sweep.
 * Included by every vertex shader that draws the model, so the base
 * surface, the fur shells and the wireframe spike the same way. The
 * including shader declares u_time.
 */

#include node-bits.glsl;
#include sweep.glsl;

uniform bool u_glitchEnabled;
uniform float u_glitchProgress;
uniform Sweep u_glitchSweep;
uniform int u_glitchUnit; // 0 = triangle, 1 = vertex
uniform float u_glitchStrength;
uniform float u_glitchRate;
uniform float u_glitchDensity;
uniform float u_glitchDuration;
uniform float u_glitchSoftness; // 0 = snap, 1 = ease out and back over the whole spike
uniform int u_glitchMask;

/** Same bitmask semantics as the other face-color masks (0 = all). */
bool inGlitchMask(float colorIdx) {
    if (u_glitchMask == 0) return true;
    int idx = int(colorIdx + 0.5);
    return idx < 16 && ((u_glitchMask >> idx) & 1) != 0;
}

/**
 * The spike height for a unit this frame, 0-1: picked in the current beat
 * and still within its duration, at a hashed height, scaled by the local
 * sweep progress at the unit. Softness turns the hard on/off window into
 * a rise and fall, so the unit travels out and back instead of snapping.
 */
float glitchSpike(float id, vec3 worldPos, vec3 meshPos) {
    float rate = max(u_glitchRate, 0.001);
    float bucket = floor(u_time * rate);
    if (hash13(vec3(id, bucket * 0.3181, 9.17)) >= u_glitchDensity) return 0.0;
    float age = u_time - bucket / rate;
    if (age >= u_glitchDuration) return 0.0;

    float envelope = 1.0;
    if (u_glitchSoftness > 0.0) {
        float phase = age / max(u_glitchDuration, 0.0001);
        envelope = clamp(min(phase, 1.0 - phase) * 2.0 / u_glitchSoftness, 0.0, 1.0);
    }

    float progress = clamp(u_glitchProgress, 0.0, 1.0);
    float local = sweepProgress(u_glitchSweep, progress, worldPos, meshPos);
    float height = 0.5 + 0.5 * hash13(vec3(id, bucket * 0.7297, 4.4));
    return height * local * envelope;
}

/** The triangle unit, the whole triangle spikes along its face normal. */
vec3 glitchTriangle(
    vec3 worldPos, vec3 centroidW, vec3 meshCentroid, vec3 worldNormal, float triId, float colorIdx
) {
    if (!u_glitchEnabled || u_glitchUnit != 0) return worldPos;
    if (!inNodeSet(NODE_GLITCH) || !inGlitchMask(colorIdx)) return worldPos;

    float spike = glitchSpike(triId * 0.7919, centroidW, meshCentroid);
    return worldPos + worldNormal * (u_glitchStrength * spike);
}

/**
 * The vertex unit, every corner at a mesh position spikes outward along
 * the smoothed normal, the average of every face sharing that position,
 * so welds hold and buffers without triangle ids (the wireframe, the fur
 * shells) follow. The normal is in world space and normalized.
 */
vec3 glitchVertex(vec3 worldPos, vec3 meshPos, vec3 smoothNormal, float colorIdx) {
    if (!u_glitchEnabled || u_glitchUnit != 1) return worldPos;
    if (!inNodeSet(NODE_GLITCH) || !inGlitchMask(colorIdx)) return worldPos;

    float id = hash13(meshPos * 91.7 + 3.1) * 1024.0;
    float spike = glitchSpike(id, worldPos, meshPos);
    if (spike <= 0.0) return worldPos;

    return worldPos + smoothNormal * (u_glitchStrength * spike);
}
