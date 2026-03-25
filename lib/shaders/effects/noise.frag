#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_time;
uniform bool u_modelOnly;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    float n = fract(sin(dot((v_texCoord * 512.0).xy, vec2(12.9898, 78.233))) * 43758.5453 + u_time);
    col.rgb += (n - 0.5) * u_amount;

    fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
}
