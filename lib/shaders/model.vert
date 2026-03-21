#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;
in float a_colorIndex;
in float a_faceFlags;

uniform mat4 u_mvp;
uniform mat4 u_worldMatrix;

out vec3 v_normal;
out vec2 v_texCoord;
out float v_colorIndex;
out float v_faceFlags;

void main() {
    gl_Position = u_mvp * vec4(a_position, 1.0);
    
    v_normal = mat3(u_worldMatrix) * a_normal;
    v_texCoord = a_texCoord;
    v_colorIndex = a_colorIndex;
    v_faceFlags = a_faceFlags;
}
