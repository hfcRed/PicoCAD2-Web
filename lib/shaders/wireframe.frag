#version 300 es
precision highp float;

in vec3 v_worldPos;

uniform vec3 u_color;

#include chunks/voxel-cut.glsl;

out vec4 fragColor;

void main() {
    applyVoxelCut(v_worldPos, vec3(0.0), false);
    fragColor = vec4(u_color, 1.0);
}
