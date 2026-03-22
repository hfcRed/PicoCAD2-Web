#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_threshold;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    float maxc = max(max(col.r, col.g), col.b);

    if (maxc > u_threshold) {
        fragColor = vec4(col.rgb, 1.0);
    } else {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}
