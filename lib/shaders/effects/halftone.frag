#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_dotSize;
uniform float u_angle;
uniform float u_blend;
uniform int u_mode;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;
uniform vec2 u_resolution;

#include color-mask.glsl;

out vec4 fragColor;

mat2 rotate2d(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

float halftonePattern(vec2 uv, float lum, float angle) {
    vec2 rotated = rotate2d(angle) * uv;
    vec2 cell = floor(rotated / u_dotSize) * u_dotSize + u_dotSize * 0.5;
    float dist = length(rotated - cell);
    float radius = u_dotSize * 0.5 * sqrt(1.0 - lum);
    return 1.0 - step(dist, radius);
}

float linePattern(vec2 uv, float lum, float angle) {
    vec2 rotated = rotate2d(angle) * uv;
    float linePos = mod(rotated.y, u_dotSize) / u_dotSize;
    float threshold = lum;
    return step(linePos, threshold);
}

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    if (!inColorMask(v_texCoord)) {
        fragColor = col;
        return;
    }

    vec3 base = col.rgb;

    if (u_bgIsTransparent) {
        base = col.a > 0.0 ? col.rgb / col.a : vec3(0.0);
    }

    float lum = dot(base, vec3(0.299, 0.587, 0.114));

    vec2 pixelCoord = v_texCoord * u_resolution;
    float pattern;

    if (u_mode == 0) {
        // Dots
        pattern = halftonePattern(pixelCoord, lum, u_angle);
    } else if (u_mode == 1) {
        // Lines
        pattern = linePattern(pixelCoord, lum, u_angle);
    } else {
        // Crosshatch
        float line1 = linePattern(pixelCoord, lum, u_angle);
        float line2 = linePattern(pixelCoord, lum, u_angle + 1.5708);
        pattern = min(line1 + line2, 1.0);
    }

    vec3 result = mix(base, vec3(pattern), u_blend);

    if (u_bgIsTransparent) {
        fragColor = vec4(min(result * col.a, vec3(col.a)), col.a);
        return;
    }

    fragColor = vec4(result, u_modelOnly ? col.a : 1.0);
}
