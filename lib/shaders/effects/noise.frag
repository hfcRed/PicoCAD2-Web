#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_time;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

#include color-mask.glsl;
#include ../chunks/hash.glsl;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    if (!inColorMask(v_texCoord)) {
        fragColor = col;
        return;
    }

    vec2 seed = v_texCoord * 512.0 + fract(u_time) * vec2(31.7, 57.3);
    float n = hash13(vec3(seed, fract(u_time) * 7.0 + 3.0));

    if (u_bgIsTransparent) {
        vec3 s = col.a > 0.0 ? col.rgb / col.a : vec3(0.0);
        vec3 fx = s + (n - 0.5) * u_amount;
        fragColor = vec4(min(fx * col.a, vec3(col.a)), col.a);
        return;
    }

    col.rgb += (n - 0.5) * u_amount;

    fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
}
