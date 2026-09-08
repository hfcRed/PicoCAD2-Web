#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in vec3 a_smoothNormal;
in vec2 a_texCoord;
in float a_colorIndex;
in float a_faceFlags;
in float a_triId;
in vec3 a_triCentroid;

uniform mat4 u_vp;
uniform mat4 u_worldMatrix;
uniform float u_time; // shared with the fragment stage's declaration

#include chunks/node-bits.glsl;
#include chunks/deform.glsl;
#include chunks/hash.glsl;
#include chunks/sweep.glsl;
#include chunks/vertex-glitch.glsl;

uniform bool u_shatterEnabled;
uniform float u_shatterProgress; // 0 = intact, 1 = fully dispersed
uniform Sweep u_shatterSweep;
uniform int u_shatterMode; // 0 = normal, 1 = radial, 2 = directional
uniform vec3 u_shatterDirection;
uniform float u_shatterDistance;
uniform float u_shatterSpread;
uniform float u_shatterRotation;
uniform float u_shatterGravity;
uniform float u_shatterShrink;
uniform int u_shatterMask;

uniform bool u_flashEnabled;
uniform float u_flashRate;
uniform float u_flashDensity;
uniform float u_flashDuration;
uniform float u_flashSoftness;
uniform int u_flashMask;

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_meshPos;
out vec2 v_texCoord;
out float v_colorIndex;
out float v_faceFlags;
out float v_flash;

/**
 * Vertex-stage masks test the face's assigned color. A vertex cannot see
 * texels, and all three corners agree, so every triangle decides
 * the same. Same bitmask semantics as the fragment-side material masks.
 */
bool inFaceMask(int mask, float colorIdx) {
    if (mask == 0) return true;
    int idx = int(colorIdx + 0.5);
    return idx < 16 && ((mask >> idx) & 1) != 0;
}

/**
 * Sends the triangle flying as a rigid piece. Offset from its centroid
 * along a per-triangle direction. Only program variants that define
 * FX_SHATTER carry the shatter.
 */
vec3 applyShatter(vec3 p, vec3 centroidW, vec3 worldNormal) {
#ifndef FX_SHATTER
    return p;
#else
    if (!u_shatterEnabled) return p;
    if (!inNodeSet(NODE_SHATTER) || !inFaceMask(u_shatterMask, a_colorIndex)) return p;
    float progress = clamp(u_shatterProgress, 0.0, 1.0);

    progress = sweepProgress(u_shatterSweep, progress, centroidW, a_triCentroid);
    if (progress <= 0.0) return p;

    vec3 seed = vec3(a_triId * 0.7919, 13.37, 71.7);
    vec4 h = hash43(seed);

    vec3 dir;
    if (u_shatterMode == 0) {
        dir = worldNormal;
    } else if (u_shatterMode == 1) {
        vec3 r = centroidW - u_deformCenter;
        float len = length(r);
        dir = len > 1e-5 ? r / len : vec3(0.0, 1.0, 0.0);
    } else {
        dir = u_shatterDirection;
    }
    dir = normalize(dir + (h.xyz * 2.0 - 1.0) * u_shatterSpread);

    float travel = u_shatterDistance * progress * (0.7 + 0.6 * h.w);
    vec3 offset = dir * travel;
    offset.y -= u_shatterGravity * progress * progress * u_shatterDistance;

    vec3 rel = p - centroidW;
    vec3 axis = normalize(hash33(seed + 41.17) * 2.0 - 1.0);
    float angle = u_shatterRotation * progress * 6.2831853 * (h.w * 2.0 - 1.0);
    rel = rotateAround(rel, axis, angle);
    rel *= max(1.0 - u_shatterShrink * progress, 0.0);

    return centroidW + offset + rel;
#endif
}

/**
 * Flash intensity for this triangle. Time is divided into buckets at
 * u_flashRate Hz, each bucket picks a random fraction of triangles, and
 * winners run a flash envelope for u_flashDuration seconds. Softness
 * turns the hard on/off window into a triangle fade. Only program
 * variants that define FX_FLASH pick triangles.
 */
float computeFlash() {
#ifndef FX_FLASH
    return 0.0;
#else
    if (!u_flashEnabled) return 0.0;
    if (!inNodeSet(NODE_FLASH) || !inFaceMask(u_flashMask, a_colorIndex)) return 0.0;

    float rate = max(u_flashRate, 0.001);
    float bucket = floor(u_time * rate);
    float pick = hash13(vec3(a_triId * 0.7919, bucket * 0.3181, 5.23));
    if (pick >= u_flashDensity) return 0.0;

    float phase = (u_time - bucket / rate) / max(u_flashDuration, 0.001);
    if (phase >= 1.0) return 0.0;

    float soft = max(u_flashSoftness, 0.0001);
    return clamp(min(phase, 1.0 - phase) * 2.0 / soft, 0.0, 1.0);
#endif
}

void main() {
    vec3 worldNormal = mat3(u_worldMatrix) * a_normal;
    vec3 worldPos = (u_worldMatrix * vec4(a_position, 1.0)).xyz;
    vec3 centroidW = (u_worldMatrix * vec4(a_triCentroid, 1.0)).xyz;

    worldPos = applyMeshDeform(worldPos);
    centroidW = applyMeshDeform(centroidW);
    
    vec3 n = normalize(worldNormal);
    vec3 smoothN = normalize(mat3(u_worldMatrix) * a_smoothNormal);
    worldPos = glitchTriangle(worldPos, centroidW, a_triCentroid, n, a_triId, a_colorIndex);
    worldPos = glitchVertex(worldPos, a_position, smoothN, a_colorIndex);
    worldPos = applyShatter(worldPos, centroidW, n);

    gl_Position = u_vp * vec4(worldPos, 1.0);

    v_normal = worldNormal;
    v_worldPos = worldPos;
    v_meshPos = a_position;
    v_texCoord = a_texCoord;
    v_colorIndex = a_colorIndex;
    v_faceFlags = a_faceFlags;
    v_flash = computeFlash();
}
