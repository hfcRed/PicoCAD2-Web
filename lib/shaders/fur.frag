#version 300 es
precision highp float;

/**
 * The fur shells. Program variants follow the model shader's: FX_INDEX_OUT
 * adds the palette index output for the scene target, FX_DEPTH_ONLY drops
 * every color output for the floor's shadow map and stops after the
 * discards, and the effect chunks carry their own feature switches.
 */

in vec3 v_normal;
in vec3 v_worldPos;
in vec3 v_meshPos;
in vec2 v_texCoord;
in float v_colorIndex;
in float v_faceFlags;
in float v_shellT;

uniform sampler2D u_indexTexture;
uniform sampler2D u_paletteTexture;
uniform vec3 u_lightDir;
uniform float u_ambient;
uniform float u_transparentColor;
uniform bool u_shadingEnabled;
uniform int u_renderMode; // 0 = texture, 1 = color
uniform int u_cutoutMask;
uniform float u_clipBelowY; // the floor's reflection pass clips real geometry below the plate
uniform int u_furMask;
uniform float u_furDensity;
uniform float u_furRootShade;

#include chunks/node-bits.glsl;
#include chunks/hash.glsl;
#include chunks/dissolve.glsl;
#include chunks/palette-blend.glsl;
#include chunks/voxel-cut.glsl;

#ifndef FX_DEPTH_ONLY
layout(location = 0) out vec4 fragColor;
#endif
#ifdef FX_INDEX_OUT
layout(location = 1) out vec4 fragIndex;
#endif

void main() {
    int flags = int(v_faceFlags + 0.5);
    bool noShade = (flags & 1) != 0;
    bool noTex = (flags & 2) != 0;

    if (v_worldPos.y < u_clipBelowY) discard;
    applyVoxelCut(v_worldPos, normalize(v_normal), (flags & 4) != 0);

    float colorIdx;
    bool fromTexture = (u_renderMode == 0 && !noTex);
    if (fromTexture) {
        float texSample = texture(u_indexTexture, v_texCoord).r;
        colorIdx = floor(texSample * 255.0 + 0.5);

        if (abs(colorIdx - u_transparentColor) < 0.5) {
            discard;
        }
    } else {
        colorIdx = v_colorIndex;
    }

    int idx = int(colorIdx + 0.5);
    if (inNodeSet(NODE_CUTOUT) && idx < 16 && ((u_cutoutMask >> idx) & 1) != 0) {
        discard;
    }

    if (u_furMask != 0 && !(idx < 16 && ((u_furMask >> idx) & 1) != 0)) {
        discard;
    }

    float coverage;
    float dissolveEdge = applyDissolveCutout(colorIdx, v_worldPos, v_meshPos, coverage);

    // Strand cutout
    vec3 cell = floor(v_meshPos * u_furDensity) + 17.17;
    float strandHeight = hash13(cell);
    if (strandHeight < v_shellT) {
        discard;
    }

#ifndef FX_DEPTH_ONLY
    vec3 normal = normalize(v_normal);
    if (gl_FrontFacing) normal = -normal;

    float rawDot = -dot(normal, u_lightDir);
    float lightAmount = clamp(1.0 - (1.0 - rawDot) * (1.0 - rawDot), 0.0, 1.0);

    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);

    int paletteRow = 0;
    if (u_shadingEnabled && !noShade) {
        float lightFactor = max(lightAmount, u_ambient);

        if (lightFactor < 0.4) {
            paletteRow = 2;
        } else if (lightFactor < 0.56) {
            paletteRow = 1;
        } else if (lightFactor < 0.75) {
            paletteRow = checker < 0.5 ? 1 : 0;
        }
    }

    // Root darkening.
    float rootRows = u_furRootShade * (1.0 - v_shellT) * 2.0;
    paletteRow += int(rootRows + (checker < 0.5 ? 0.25 : 0.75));
    paletteRow = clamp(paletteRow, 0, 2);

    float u = (colorIdx + 0.5) / 16.0;
    float v = (float(paletteRow) + 0.5) / 6.0 + paletteBlendOffset();
    vec3 color = texture(u_paletteTexture, vec2(u, v)).rgb;

    color = applyDissolveEdge(color, dissolveEdge);

    float alpha = fadeAlpha(coverage);
    fragColor = vec4(color * alpha, alpha);

#ifdef FX_INDEX_OUT
    // Fur strands are the material extended outward, so they write their
    // base index, with the dissolve's coverage like the surface they grow from.
    fragIndex = vec4(colorIdx / 255.0, float(paletteRow) / 255.0, coverage, 1.0);
#endif
#endif
}
