#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_time;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    if (col.rgba != vec4(0.0, 0.0, 0.0, 1.0) && col.a > 0.0) {
        float n = fract(sin(dot((v_texCoord * 512.0).xy, vec2(12.9898, 78.233))) * 43758.5453 + u_time);
        col.rgb += (n - 0.5) * u_amount;
    }

    fragColor = col;
}
