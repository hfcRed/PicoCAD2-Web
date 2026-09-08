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
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

#include color-mask.glsl;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragIndex;

void main() {
    vec2 uv = v_texCoord;

    fragIndex = texture(u_indexTexture, uv);

    vec2 deltaPx = (uv - u_center) * u_resolution;
    float distPx = length(deltaPx);

    vec2 dirUv = distPx > 0.0 ? (deltaPx / distPx) / u_resolution : vec2(0.0);

    float dist = distPx * 2.0 / max(u_resolution.x, u_resolution.y);
    float falloffFactor = pow(dist, u_radialFalloff);
    float factor = falloffFactor * u_amount;

    vec2 rUV = uv - dirUv * factor * u_redOffset;
    vec2 gUV = uv - dirUv * factor * u_greenOffset;
    vec2 bUV = uv - dirUv * factor * u_blueOffset;

    vec4 r = inColorMask(rUV) ? texture(u_texture, rUV) : texture(u_texture, uv);
    vec4 g = inColorMask(gUV) ? texture(u_texture, gUV) : texture(u_texture, uv);
    vec4 b = inColorMask(bUV) ? texture(u_texture, bUV) : texture(u_texture, uv);

    float blendAlpha = (r.a + g.a + b.a) / 3.0;

    if (u_bgIsTransparent) {
        if (u_modelOnly) {
            fragColor = vec4(min(vec3(r.r, g.g, b.b), vec3(blendAlpha)), blendAlpha);
        } else {
            fragColor = vec4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
        }
        return;
    }

    fragColor = vec4(r.r, g.g, b.b, u_modelOnly ? blendAlpha : 1.0);
}
