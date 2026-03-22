#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_amount;
uniform vec2 u_resolution;
uniform float u_blend;
uniform vec3 u_channelAmount;

out vec4 fragColor;

float bayer4x4(int x, int y) {
    if (x == 0 && y == 0) return 0.0;
    if (x == 1 && y == 0) return 8.0;
    if (x == 2 && y == 0) return 2.0;
    if (x == 3 && y == 0) return 10.0;
    if (x == 0 && y == 1) return 12.0;
    if (x == 1 && y == 1) return 4.0;
    if (x == 2 && y == 1) return 14.0;
    if (x == 3 && y == 1) return 6.0;
    if (x == 0 && y == 2) return 3.0;
    if (x == 1 && y == 2) return 11.0;
    if (x == 2 && y == 2) return 1.0;
    if (x == 3 && y == 2) return 9.0;
    if (x == 0 && y == 3) return 15.0;
    if (x == 1 && y == 3) return 7.0;
    if (x == 2 && y == 3) return 13.0;
    if (x == 3 && y == 3) return 5.0;
    return 0.0;
}

void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec4 col = orig;
    vec2 pos = v_texCoord * u_resolution;

    int xi = int(mod(pos.x, 4.0));
    int yi = int(mod(pos.y, 4.0));

    float baseThreshold = (bayer4x4(xi, yi) + 0.5) / 16.0 * u_amount;

    col.r = floor(col.r + baseThreshold * u_channelAmount.r);
    col.g = floor(col.g + baseThreshold * u_channelAmount.g);
    col.b = floor(col.b + baseThreshold * u_channelAmount.b);

    fragColor = vec4(mix(orig.rgb, col.rgb, clamp(u_blend, 0.0, 1.0)), orig.a);
}
