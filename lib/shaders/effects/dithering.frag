#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_amount;
uniform vec2 u_resolution;
uniform float u_blend;
uniform vec3 u_channelAmount;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

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

    vec3 offset = ((bayer4x4(xi, yi) + 0.5) / 16.0 - 0.5) * u_amount * u_channelAmount;

    if (u_bgIsTransparent) {
        vec3 s = orig.a > 0.0 ? orig.rgb / orig.a : vec3(0.0);
        vec3 dithered = floor(s + 0.5 + offset);
        vec3 fx = mix(s, dithered, clamp(u_blend, 0.0, 1.0));
        fragColor = vec4(min(fx * orig.a, vec3(orig.a)), orig.a);
        return;
    }

    col.rgb = floor(col.rgb + 0.5 + offset);

    fragColor = vec4(mix(orig.rgb, col.rgb, clamp(u_blend, 0.0, 1.0)), u_modelOnly ? orig.a : 1.0);
}
