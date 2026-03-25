#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_smoothness;
uniform float u_roundness;
uniform vec3 u_color;
uniform bool u_modelOnly;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    vec2 uv = v_texCoord * 2.0 - 1.0;
    uv.x *= mix(1.0, 1.0, u_roundness);

    float dist = length(uv);
    float vignette = smoothstep(1.0 - u_smoothness, 1.0, dist * u_intensity);

    col.rgb = mix(col.rgb, u_color, vignette);

    fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
}
