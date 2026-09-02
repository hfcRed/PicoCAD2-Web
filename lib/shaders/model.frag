#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_worldPos;
in vec3 v_meshPos;
in vec2 v_texCoord;
in float v_colorIndex;
in float v_faceFlags;
in float v_flash;

uniform sampler2D u_indexTexture;
uniform sampler2D u_paletteTexture;
uniform vec3 u_lightDir;
uniform float u_ambient;
uniform float u_transparentColor;
uniform bool u_shadingEnabled;
uniform int u_renderMode; // 0 = texture, 1 = color
uniform int u_cutoutMask;

#include chunks/node-bits.glsl;
#include chunks/material-effects.glsl;
#include chunks/palette-blend.glsl;
#include chunks/voxel-cut.glsl;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragIndex;

void main() {
    applyVoxelCut(v_worldPos);

    int flags = int(v_faceFlags + 0.5);
    bool noShade = (flags & 1) != 0;
    bool noTex = (flags & 2) != 0;

    float colorIdx;
    bool fromTexture = (u_renderMode == 0 && !noTex);
    if (fromTexture) {
        float texSample = texture(u_indexTexture, v_texCoord).r;
        colorIdx = floor(texSample * 255.0 + 0.5);

        // Discard transparent pixels
        if (abs(colorIdx - u_transparentColor) < 0.5) {
            discard;
        }
    } else {
        colorIdx = v_colorIndex;
    }

    // Color cutout: selected palette colors act as additional transparent colors
    int cutoutIdx = int(colorIdx + 0.5);
    if (inNodeSet(NODE_CUTOUT) && cutoutIdx < 16 && ((u_cutoutMask >> cutoutIdx) & 1) != 0) {
        discard;
    }

    float dissolveEdge = applyDissolveCutout(colorIdx, v_worldPos, v_meshPos);

    vec3 normal = normalize(v_normal);
    if (gl_FrontFacing) normal = -normal;

    // Headlight amount, shared by the shading and the material effects
    float rawDot = -dot(normal, u_lightDir);
    float lightAmount = clamp(1.0 - (1.0 - rawDot) * (1.0 - rawDot), 0.0, 1.0);

    float projection = projectionAmount(colorIdx, normal, v_worldPos);
    bool projectionOnRows = projection > 0.0 && !u_projectionSmooth && u_projectionMode != 2;

    // Compute shading level
    int paletteRow = 0;
    if (u_shadingEnabled && !noShade) {
        float lightFactor = max(lightAmount, u_ambient);

        if (lightFactor < 0.4) {
            paletteRow = 2;
        } else if (lightFactor < 0.56) {
            paletteRow = 1;
        } else if (lightFactor < 0.75) {
            // Dithering
            float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
            paletteRow = checker < 0.5 ? 1 : 0;
        }
    }

    if (projectionOnRows) {
        paletteRow = clamp(paletteRow + projectionRowShift(projection), 0, 2);
    }

    float emission = emissionAmount(colorIdx, v_worldPos);
    if (emission > 0.0 && !u_emissionSmooth && ditherGate(emission)) {
        paletteRow = 0;
    }

    float u = (colorIdx + 0.5) / 16.0;
    float rowSet = paletteBlendOffset();
    float v = (float(paletteRow) + 0.5) / 6.0 + rowSet;
    vec3 color = texture(u_paletteTexture, vec2(u, v)).rgb;

    if (projection > 0.0 && !projectionOnRows) {
        vec3 lit = texture(u_paletteTexture, vec2(u, 0.5 / 6.0 + rowSet)).rgb;
        vec3 dark = texture(u_paletteTexture, vec2(u, 2.5 / 6.0 + rowSet)).rgb;
        color = applyProjectionColor(color, projection, lit, dark);
    }

    if (emission > 0.0 && u_emissionSmooth) {
        vec3 lit = texture(u_paletteTexture, vec2(u, 0.5 / 6.0 + rowSet)).rgb;
        color = mix(color, lit, emission);
    }

    color = applyMaterialEffects(
        color, colorIdx, normal, v_worldPos, v_texCoord, lightAmount, -u_lightDir
    );
    color = applyTriangleFlash(color, v_flash);
    color = applyDissolveEdge(color, dissolveEdge);

    fragColor = vec4(color, 1.0);

    // Base palette index (R) and shade row (G) for the screen-space index
    // buffer used by effect color masks. The base index is written before
    // the shade-row remap so masks select materials, not displayed colors.
    // Ignored when no second color attachment is bound.
    fragIndex = vec4(colorIdx / 255.0, float(paletteRow) / 255.0, 0.0, 0.0);
}
