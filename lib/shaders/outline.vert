#version 300 es
precision highp float;

out vec2 v_texCoord;

void main() {
    // Fullscreen triangle from vertex IDs 0, 1, 2
    // Covers clip space [-1, -1] to [1, 1] and beyond
    vec2 pos;
    pos.x = (gl_VertexID == 1) ? 3.0 : -1.0;
    pos.y = (gl_VertexID == 2) ? 3.0 : -1.0;
    v_texCoord = pos * 0.5 + 0.5;
    gl_Position = vec4(pos, 0.0, 1.0);
}
