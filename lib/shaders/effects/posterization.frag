#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_levels;
uniform vec3 u_channelLevels;
uniform float u_gamma;
uniform bool u_colorBanding;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    vec3 effectiveLevels = max(vec3(u_levels) * u_channelLevels, vec3(2.0));

    if (u_bgIsTransparent) {
        vec3 s = col.a > 0.0 ? col.rgb / col.a : vec3(0.0);
        s = pow(s, vec3(u_gamma));

        if (u_colorBanding) {
            s.r = floor(s.r * effectiveLevels.r + 0.25) / (effectiveLevels.r - 1.0);
            s.g = floor(s.g * effectiveLevels.g + 0.5) / (effectiveLevels.g - 1.0);
            s.b = floor(s.b * effectiveLevels.b + 0.75) / (effectiveLevels.b - 1.0);
        } else {
            s = floor(s * effectiveLevels) / (effectiveLevels - 1.0);
        }

        s = pow(s, vec3(1.0 / u_gamma));
        fragColor = vec4(min(s * col.a, vec3(col.a)), col.a);
        return;
    }

    col.rgb = pow(col.rgb, vec3(u_gamma));

    if (u_colorBanding) {
        col.r = floor(col.r * effectiveLevels.r + 0.25) / (effectiveLevels.r - 1.0);
        col.g = floor(col.g * effectiveLevels.g + 0.5) / (effectiveLevels.g - 1.0);
        col.b = floor(col.b * effectiveLevels.b + 0.75) / (effectiveLevels.b - 1.0);
    } else {
        col.rgb = floor(col.rgb * effectiveLevels) / (effectiveLevels - 1.0);
    }

    col.rgb = pow(col.rgb, vec3(1.0 / u_gamma));

    fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
}
