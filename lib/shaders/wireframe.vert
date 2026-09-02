#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_vp;
uniform mat4 u_worldMatrix;

#include chunks/deform.glsl;

out vec3 v_worldPos;

void main() {
    vec3 worldPos = (u_worldMatrix * vec4(a_position, 1.0)).xyz;
    worldPos = applyMeshDeform(worldPos);
    gl_Position = u_vp * vec4(worldPos, 1.0);
    v_worldPos = worldPos;
}
