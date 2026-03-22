#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amount;
uniform float u_redOffset;
uniform float u_greenOffset;
uniform float u_blueOffset;
uniform float u_radialFalloff;
uniform vec2 u_center;

out vec4 fragColor;

void main() {
    vec2 uv = v_texCoord;
    vec2 texel = 1.0 / u_resolution;
    vec2 dir = normalize(uv - u_center);

    float dist = length(uv - u_center) * 2.0;
    float falloffFactor = pow(dist, u_radialFalloff);
    float factor = falloffFactor * u_amount * texel.x;

    vec4 r = texture(u_texture, uv - dir * factor * u_redOffset);
    vec4 g = texture(u_texture, uv - dir * factor * u_greenOffset);
    vec4 b = texture(u_texture, uv - dir * factor * u_blueOffset);

    float alpha = (r.a + g.a + b.a) / 3.0;
    fragColor = vec4(r.r * alpha, g.g * alpha, b.b * alpha, 1.0);
}
