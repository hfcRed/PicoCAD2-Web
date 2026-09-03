#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_vp;
uniform mat4 u_worldMatrix;
uniform float u_time;

#include chunks/deform.glsl;
#include chunks/vertex-glitch.glsl;

out vec3 v_worldPos;

void main() {
    vec3 worldPos = (u_worldMatrix * vec4(a_position, 1.0)).xyz;
    worldPos = applyMeshDeform(worldPos);

    worldPos = glitchVertex(worldPos, a_position, 0.0);
    gl_Position = u_vp * vec4(worldPos, 1.0);
    v_worldPos = worldPos;
}
