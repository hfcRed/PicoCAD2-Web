#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform int u_mode;
uniform vec3 u_color;
uniform float u_intensity;
uniform vec3 u_shadowColor;
uniform vec3 u_highlightColor;
uniform float u_blend;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    vec3 result;

    if (u_bgIsTransparent) {
        vec3 s = col.a > 0.0 ? col.rgb / col.a : vec3(0.0);

        if (u_mode == 0) {
            // Tint mode
            result = mix(s, s * u_color, u_intensity);
        } else {
            // Duotone mode
            float lum = dot(s, vec3(0.299, 0.587, 0.114));
            result = mix(u_shadowColor, u_highlightColor, lum);
        }

        result = mix(s, result, u_blend);
        fragColor = vec4(min(result * col.a, vec3(col.a)), col.a);
        return;
    }

    if (u_mode == 0) {
        // Tint mode
        result = mix(col.rgb, col.rgb * u_color, u_intensity);
    } else {
        // Duotone mode
        float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        result = mix(u_shadowColor, u_highlightColor, lum);
    }

    result = mix(col.rgb, result, u_blend);

    fragColor = vec4(result, u_modelOnly ? col.a : 1.0);
}
