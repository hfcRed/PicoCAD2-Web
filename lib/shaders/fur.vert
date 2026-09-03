#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in vec3 a_smoothNormal;
in vec2 a_texCoord;
in float a_colorIndex;
in float a_faceFlags;

uniform mat4 u_vp;
uniform mat4 u_worldMatrix;
uniform float u_time;

#include chunks/deform.glsl;
#include chunks/vertex-glitch.glsl;

uniform float u_furLength;
uniform float u_furLayers;
uniform vec3 u_furGravity;

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_meshPos;
out vec2 v_texCoord;
out float v_colorIndex;
out float v_faceFlags;
out float v_shellT;

void main() {
    // Shell 0 is the base model itself, instances draw shells 1..layers.
    float t = (float(gl_InstanceID) + 1.0) / max(u_furLayers, 1.0);

    // Shells offset along the position-averaged smoothed normals. The
    // per-corner face normals would crack the shells apart at every edge.
    vec3 shellNormal = normalize(mat3(u_worldMatrix) * a_smoothNormal);
    vec3 worldPos = (u_worldMatrix * vec4(a_position, 1.0)).xyz;
    worldPos += shellNormal * (u_furLength * t) + u_furGravity * (u_furLength * t * t);
    worldPos = applyMeshDeform(worldPos);
    worldPos = glitchVertex(worldPos, a_position, a_colorIndex);

    gl_Position = u_vp * vec4(worldPos, 1.0);

    v_normal = mat3(u_worldMatrix) * a_normal;
    v_worldPos = worldPos;
    v_meshPos = a_position;
    v_texCoord = a_texCoord;
    v_colorIndex = a_colorIndex;
    v_faceFlags = a_faceFlags;
    v_shellT = t;
}
