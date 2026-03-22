#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_blur;
uniform vec2 u_resolution;
uniform vec2 u_direction;

out vec4 fragColor;

void main() {
    vec2 texel = 1.0 / u_resolution;
    vec4 result = vec4(0.0);

    float weights[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

    vec2 offset = u_blur * texel * u_direction;
    result += texture(u_texture, v_texCoord) * weights[0];

    for (int i = 1; i < 5; ++i) {
        result += texture(u_texture, v_texCoord + float(i) * offset) * weights[i];
        result += texture(u_texture, v_texCoord - float(i) * offset) * weights[i];
    }

    fragColor = result;
}
