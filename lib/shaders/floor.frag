#version 300 es
precision highp float;

/**
 * The floor plate's surface. A flat color with optional world-space grid
 * lines, the model's shadow looked up in the floor's shadow map, and the
 * model's mirror image sampled from the reflection pass. Shadow and
 * reflection come in through an ordered dither by their strength, or blend
 * in smooth style, and the plate fades out toward its edge through the
 * same dither in every style, since the scene pass has no blending. With
 * the surface off there is nothing to blend into, so the shadow, the grid
 * and the reflection claim whole pixels by their strength in every style
 * and the rest of the plate is discarded. The plate writes the no-model
 * palette index, so post-effect masks, ambient occlusion and the drop
 * shadow leave it alone while depth-based effects still reach it.
 */

in vec3 v_worldPos;

uniform vec3 u_floorCenter;
uniform float u_floorHalf;
uniform vec3 u_floorColor;
uniform float u_floorFade;
uniform bool u_floorSmooth;
uniform bool u_floorGridOn;
uniform float u_floorGridSpacing;
uniform float u_floorGridThickness;
uniform vec3 u_floorGridColor;
uniform bool u_floorSurface;
uniform bool u_floorShadowOn;
uniform mat4 u_floorLightVp;
uniform sampler2D u_floorShadowMap;
uniform vec3 u_floorShadowColor;
uniform float u_floorShadowStrength;
uniform bool u_floorReflectionOn;
uniform sampler2D u_floorReflection;
uniform float u_floorReflectionStrength;
uniform vec2 u_resolution;
uniform vec2 u_viewportOrigin;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragIndex;

/** The 4x4 Bayer threshold of this pixel, 1/32 to 31/32. */
float bayerThreshold() {
    ivec2 lo = ivec2(gl_FragCoord.xy) & 1;
    ivec2 hi = (ivec2(gl_FragCoord.xy) >> 1) & 1;
    int bayer = 4 * (2 * (lo.x ^ lo.y) + lo.y) + 2 * (hi.x ^ hi.y) + hi.y;
    return (float(bayer) + 0.5) / 16.0;
}

/** Brings a color in by amount. Claimed whole pixels by the dither, or a mix in smooth style. */
vec3 styled(vec3 base, vec3 target, float amount, float threshold) {
    if (u_floorSmooth) return mix(base, target, clamp(amount, 0.0, 1.0));
    return amount > threshold ? target : base;
}

/** Whether the model's shadow pass saw an occluder between the light and this point. */
bool inShadow() {
    vec4 clip = u_floorLightVp * vec4(v_worldPos, 1.0);
    vec3 ndc = clip.xyz / clip.w;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return false;
    float depth = ndc.z * 0.5 + 0.5;
    return depth - 0.001 > texture(u_floorShadowMap, uv).r;
}

void main() {
    // The grid's pixel width comes from derivatives, taken before any
    // discard can leave them undefined. Lines thin out as the cells shrink
    // toward a couple of pixels, so a dense grid dithers away instead of
    // flooding the plate with the line color.
    vec2 cells = v_worldPos.xz / u_floorGridSpacing;
    vec2 width = max(fwidth(cells), vec2(1e-6));
    vec2 toLine = abs(fract(cells - 0.5) - 0.5) / width;
    bool onLine = u_floorGridOn && min(toLine.x, toLine.y) < u_floorGridThickness * 0.5;
    float lineCoverage = clamp((0.5 - max(width.x, width.y)) * 4.0, 0.0, 1.0);

    float threshold = bayerThreshold();

    vec2 rel = abs(v_worldPos.xz - u_floorCenter.xz) / u_floorHalf;
    float edge = max(rel.x, rel.y);
    float coverage = u_floorFade > 0.0 ? clamp((1.0 - edge) / u_floorFade, 0.0, 1.0) : 1.0;
    if (coverage <= threshold) discard;

    bool shadowed = u_floorShadowOn && inShadow();
    vec4 mirror = vec4(0.0);
    if (u_floorReflectionOn) {
        vec2 uv = (gl_FragCoord.xy - u_viewportOrigin) / u_resolution;
        mirror = texture(u_floorReflection, uv);
    }
    bool mirrored = mirror.a > 0.5;

    vec3 line = shadowed
        ? styled(u_floorGridColor, u_floorShadowColor, u_floorShadowStrength * 0.5, threshold)
        : u_floorGridColor;

    vec3 color = u_floorColor;
    if (u_floorSurface) {
        if (shadowed) color = styled(color, u_floorShadowColor, u_floorShadowStrength, threshold);
        if (onLine) color = styled(color, line, lineCoverage, threshold);
        if (mirrored) color = styled(color, mirror.rgb, u_floorReflectionStrength, threshold);
    } else {
        bool hit = false;
        if (shadowed && u_floorShadowStrength > threshold) {
            color = u_floorShadowColor;
            hit = true;
        }
        if (onLine && lineCoverage > threshold) {
            color = line;
            hit = true;
        }
        if (mirrored && u_floorReflectionStrength > threshold) {
            color = mirror.rgb;
            hit = true;
        }
        if (!hit) discard;
    }

    fragColor = vec4(color, 1.0);
    fragIndex = vec4(1.0, 0.0, 0.0, 0.0);
}
