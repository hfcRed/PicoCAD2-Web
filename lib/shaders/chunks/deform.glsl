/**
 * Mesh deform: barrel, spherify and twist as closed-form world-space
 * position warps, included by both model.vert and wireframe.vert so
 * wireframe edges follow the deformed surface. The voxel remesh happens on
 * the CPU before these warps, so a voxelized model can still bulge and
 * twist.
 *
 * Deforms are centered on the model's rest-pose bounds and applied after
 * the node transform, so hierarchy and animation stay correct. Normals
 * are left alone, under flat shading the error is invisible. Each warp
 * scales by the local progress of the deform's sweep at the vertex, so a
 * moving front bends the model instead of tearing it. Both triangles of a
 * shared edge evaluate the same field at the same position.
 *
 * The warps only compile into program variants that define FX_DEFORM,
 * every other variant passes positions through.
 */

#include node-bits.glsl;
#include deform-sweep.glsl;

uniform bool u_deformEnabled;
uniform float u_deformBarrel;
uniform int u_deformBarrelAxis; // 0 = x, 1 = y, 2 = z
uniform float u_deformSpherify;
uniform float u_deformTwist;
uniform int u_deformTwistAxis;
uniform vec3 u_deformCenter;
uniform vec3 u_deformHalfExt;

vec3 deformAxis(int axis) {
    if (axis == 0) return vec3(1.0, 0.0, 0.0);
    if (axis == 2) return vec3(0.0, 0.0, 1.0);
    return vec3(0.0, 1.0, 0.0);
}

/** Rotates v around a normalized axis by an angle (Rodrigues). */
vec3 rotateAround(vec3 v, vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

float deformHalfExtent(int axis) {
    float e = axis == 0 ? u_deformHalfExt.x : axis == 1 ? u_deformHalfExt.y : u_deformHalfExt.z;
    return max(e, 1e-5);
}

vec3 applyMeshDeform(vec3 p) {
#ifndef FX_DEFORM
    return p;
#else
    if (!u_deformEnabled || !inNodeSet(NODE_DEFORM)) return p;

    float local = deformProgress(p);
    if (local <= 0.0) return p;

    vec3 rel = p - u_deformCenter;

    if (u_deformSpherify > 0.0) {
        float len = length(rel);
        if (len > 1e-5) {
            float radius = length(u_deformHalfExt);
            rel = mix(rel, rel * (radius / len), u_deformSpherify * local);
        }
    }

    if (u_deformBarrel != 0.0) {
        vec3 ax = deformAxis(u_deformBarrelAxis);
        float h = clamp(dot(rel, ax) / deformHalfExtent(u_deformBarrelAxis), -1.0, 1.0);
        float bulge = 1.0 + u_deformBarrel * local * (1.0 - h * h);
        vec3 axial = ax * dot(rel, ax);
        rel = axial + (rel - axial) * bulge;
    }

    if (u_deformTwist != 0.0) {
        vec3 ax = deformAxis(u_deformTwistAxis);
        float h = dot(rel, ax) / deformHalfExtent(u_deformTwistAxis);
        float angle = h * (u_deformTwist * 3.14159265) * local;
        rel = rotateAround(rel, ax, angle);
    }

    return u_deformCenter + rel;
#endif
}
