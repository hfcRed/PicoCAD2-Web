#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_smoothness;
uniform float u_roundness;
uniform vec3 u_color;
uniform vec2 u_resolution;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    vec2 uv = v_texCoord * 2.0 - 1.0;
    uv.x *= mix(1.0, u_resolution.x / u_resolution.y, u_roundness);

    float dist = length(uv);
    float vignette = smoothstep(1.0 - max(u_smoothness, 1e-4), 1.0, dist * u_intensity);

    if (u_bgIsTransparent) {
        if (u_modelOnly) {
            vec3 s = col.a > 0.0 ? col.rgb / col.a : vec3(0.0);
            vec3 fx = mix(s, u_color, vignette);
            fragColor = vec4(fx * col.a, col.a);
        } else {
            vec3 rgb = u_color * vignette + col.rgb * (1.0 - vignette);
            float outA = vignette + col.a * (1.0 - vignette);
            fragColor = vec4(rgb, outA);
        }
        return;
    }

    col.rgb = mix(col.rgb, u_color, vignette);

    fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
}
