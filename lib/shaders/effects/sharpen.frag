#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_strength;
uniform float u_threshold;
uniform vec2 u_resolution;
uniform bool u_modelOnly;

out vec4 fragColor;

void main() {
    vec2 texel = 1.0 / u_resolution;

    vec4 center = texture(u_texture, v_texCoord);
    vec4 top    = texture(u_texture, v_texCoord + vec2(0.0, texel.y));
    vec4 bottom = texture(u_texture, v_texCoord - vec2(0.0, texel.y));
    vec4 left   = texture(u_texture, v_texCoord - vec2(texel.x, 0.0));
    vec4 right  = texture(u_texture, v_texCoord + vec2(texel.x, 0.0));

    vec4 sharpened = center * 5.0 - top - bottom - left - right;
    vec4 diff = sharpened - center;

    float diffMag = length(diff.rgb);
    if (diffMag < u_threshold) {
        diff = vec4(0.0);
    }

    vec3 result = center.rgb + diff.rgb * u_strength;

    fragColor = vec4(result, u_modelOnly ? center.a : 1.0);
}
