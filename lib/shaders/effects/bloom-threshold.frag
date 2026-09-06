#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_threshold;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

#include color-mask.glsl;

out vec4 fragColor;

void main() {
    if (!inColorMask(v_texCoord)) {
        fragColor = u_bgIsTransparent ? vec4(0.0) : vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec4 col = texture(u_texture, v_texCoord);

    if (u_bgIsTransparent) {
        float minCoverage = u_modelOnly ? 0.5 : 0.001;
        if (col.a < minCoverage) {
            fragColor = vec4(0.0);
            return;
        }

        float maxc = max(max(col.r, col.g), col.b) / col.a;
        fragColor = maxc > u_threshold ? col : vec4(0.0);
        return;
    }

    if (u_modelOnly && col.a < 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    float maxc = max(max(col.r, col.g), col.b);

    if (maxc > u_threshold) {
        fragColor = vec4(col.rgb, 1.0);
    } else {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}
