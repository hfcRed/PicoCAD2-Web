/**
 * Material effects applied inside the model shader: interior, rim light,
 * gradient light, specular + environment reflection, glitter, the
 * emission envelope and the pattern projection. Self-contained. Declares
 * its own uniforms and receives all per-fragment inputs as parameters of
 * applyMaterialEffects(). The dissolve chunk rides along here so the
 * model shader gets it with the same include.
 *
 * Every effect supports three styles. Palette and dithered style
 * (u_*Smooth = false) only ever output the effect color passed from the
 * CPU and convert soft intensities into the same 2x2 checkerboard
 * dithering the shading system uses. For palette style the CPU snaps the
 * color to a palette entry so the render stays made of palette entries,
 * while dithered style keeps the configured color. The shader cannot tell
 * the two apart. Smooth style does plain RGB blending. Emission has no
 * free color, so its dithered style behaves like palette.
 *
 * Masks test the base palette index before the shade-row lookup, so they
 * select materials whether lit or in shadow, mirroring the post-effect
 * mask implementation. The material pass never changes the index G-buffer:
 * a rim or sparkle is light on a material instead of a material change.
 *
 * Each effect only compiles into the program variants that define its
 * feature switch (FX_INTERIOR, FX_RIM, FX_GRADLIGHT, FX_SPECULAR,
 * FX_GLITTER, FX_EMISSION, FX_PROJECTION, FX_FLASH), the other variants
 * pass the color through. The uniforms stay declared everywhere, an
 * unused uniform costs nothing. The hash and color chunks are included
 * ahead of the pattern library because the include deduplication keeps
 * only the first occurrence, which must not sit behind a feature switch.
 */

#include node-bits.glsl;
#include hash.glsl;
#include color.glsl;
#if defined(FX_INTERIOR) || defined(FX_PROJECTION)
#include patterns.glsl;
#endif
#include dissolve.glsl;

uniform vec3 u_cameraPos;
uniform vec3 u_cameraFwd;
uniform vec3 u_cameraRight;
uniform bool u_isOrtho;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_viewportOrigin;
uniform float u_boundsMinY; // model rest-pose world bounds, for worldY ramps
uniform float u_boundsSpanY;

uniform bool u_interiorEnabled;
uniform int u_interiorPattern; // 0 = stars, 1 = dust, 2 = voronoi, 3 = lava, 4 = grid
uniform float u_interiorDepth;
uniform int u_interiorLayers;
uniform float u_interiorScale;
uniform float u_interiorSpeed;
uniform float u_interiorSeed;
uniform vec3 u_interiorColor;
uniform vec3 u_interiorBgColor;
uniform float u_interiorHueRange;
uniform bool u_interiorSmooth;
uniform int u_interiorMask;

uniform bool u_rimEnabled;
uniform vec3 u_rimColor;
uniform float u_rimWidth;
uniform float u_rimSharpness;
uniform float u_rimLightAlign;
uniform float u_rimBlend;
uniform bool u_rimInvert;
uniform bool u_rimSmooth;
uniform int u_rimMask;

uniform bool u_gradLightEnabled;
uniform vec3 u_gradLightLit;
uniform vec3 u_gradLightShadow;
uniform int u_gradLightSource; // 0 = light, 1 = worldY, 2 = screenY
uniform float u_gradLightBlend;
uniform bool u_gradLightSmooth;
uniform int u_gradLightMask;

uniform bool u_specEnabled;
uniform vec3 u_specColor;
uniform float u_specStrength;
uniform float u_specSmoothness;
uniform float u_specAnisotropy;
uniform float u_envStrength;
uniform vec3 u_envSky;
uniform vec3 u_envGround;
uniform float u_envHorizon;
uniform float u_envFresnel;
uniform bool u_specSmooth;
uniform int u_specMask;

uniform vec3 u_flashColor;
uniform int u_flashMode; // 0 = replace, 1 = add (smooth style only)
uniform bool u_flashSmooth;

uniform bool u_glitterEnabled;
uniform vec3 u_glitterColor;
uniform int u_glitterSpace; // 0 = uv, 1 = screen, 2 = world
uniform float u_glitterDensity;
uniform float u_glitterSize;
uniform float u_glitterHueRange;
uniform float u_glitterBrightness;
uniform float u_glitterAngleCos;
uniform float u_glitterSpeed;
uniform int u_glitterShape; // 0 = square, 1 = circle
uniform bool u_glitterSmooth;
uniform int u_glitterMask;

uniform bool u_emissionEnabled;
uniform float u_emissionStrength;
uniform int u_emissionBlinkMode; // 0 = smooth, 1 = pulse
uniform float u_emissionBlinkRate;
uniform float u_emissionBlinkMin;
uniform vec3 u_emissionScrollDir;
uniform float u_emissionScrollWidth;
uniform float u_emissionScrollGap;
uniform float u_emissionScrollSpeed;
uniform bool u_emissionSmooth;
uniform int u_emissionMask;

uniform bool u_projectionEnabled;
uniform int u_projectionPattern;
uniform int u_projectionMode; // 0 = light, 1 = shadow, 2 = tint
uniform vec3 u_projectionDir; // normalized travel direction
uniform vec3 u_projectionU; // plane basis perpendicular to the direction
uniform vec3 u_projectionV;
uniform vec3 u_projectionColor;
uniform float u_projectionScale;
uniform float u_projectionSpeed;
uniform float u_projectionSeed;
uniform float u_projectionStrength;
uniform float u_projectionFacing;
uniform bool u_projectionSmooth;
uniform int u_projectionMask;

/**
 * Returns true if the fragment's base palette index is selected by the
 * mask bitmask. A mask of 0 means no colors are selected, which applies
 * the effect everywhere (empty maskedColors array semantics).
 */
bool inMaterialMask(int mask, float colorIdx) {
    if (mask == 0) return true;
    int idx = int(colorIdx + 0.5);
    return idx < 16 && ((mask >> idx) & 1) != 0;
}

/**
 * Converts a 0-1 effect intensity into an on/off decision using the
 * shading system's 2x2 checkerboard: below 0.25 the effect is off,
 * above 0.75 fully on, and the band in between dithers.
 */
bool ditherGate(float t) {
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    return t > (checker < 0.5 ? 0.25 : 0.75);
}

/**
 * Blends an effect color over the base by intensity t. Palette style
 * claims whole pixels through the dither gate; smooth style mixes.
 */
vec3 applyStyled(vec3 base, vec3 effectColor, float t, bool smoothStyle) {
    if (smoothStyle) return mix(base, effectColor, clamp(t, 0.0, 1.0));
    return ditherGate(t) ? effectColor : base;
}

/**
 * How fully the fragment ignores shading. 0-1: the emission strength
 * modulated by the blink envelope and the world-space scrolling band
 * wave. The model shader turns this into a shade-row claim (palette
 * style, dithered) or a mix toward the lit color
 * (smooth style).
 */
float emissionAmount(float colorIdx, vec3 worldPos) {
#ifndef FX_EMISSION
    return 0.0;
#else
    if (!u_emissionEnabled || !inNodeSet(NODE_EMISSION) ||
        !inMaterialMask(u_emissionMask, colorIdx)) {
        return 0.0;
    }

    float e = clamp(u_emissionStrength, 0.0, 1.0);

    if (u_emissionBlinkRate > 0.0) {
        float phase = fract(u_time * u_emissionBlinkRate);
        float w = u_emissionBlinkMode == 0
            ? 0.5 + 0.5 * sin(6.2831853 * phase)
            : (phase < 0.5 ? 1.0 : 0.0);
        e *= mix(clamp(u_emissionBlinkMin, 0.0, 1.0), 1.0, w);
    }

    if (u_emissionScrollGap > 0.0) {
        float period = u_emissionScrollWidth + u_emissionScrollGap;
        float x = dot(worldPos, u_emissionScrollDir)
            - u_time * u_emissionScrollSpeed;
        float px = mod(x, period);
        e *= px < u_emissionScrollWidth
            ? sin(3.14159265 * px / u_emissionScrollWidth)
            : 0.0;
    }

    return e;
#endif
}

/**
 * The projected pattern's intensity at the fragment, 0-1. Zero where the
 * surface does not receive the projection, outside the mask or the node
 * selection, or on faces turned away from the incoming direction. The
 * pattern is sampled on the plane perpendicular to the direction, so it
 * stays put while the model moves along the axis. The planar line
 * patterns keep their slice pinned like the interior does.
 */
float projectionAmount(float colorIdx, vec3 normal, vec3 worldPos) {
#ifndef FX_PROJECTION
    return 0.0;
#else
    if (!u_projectionEnabled || !inNodeSet(NODE_PROJECTION) ||
        !inMaterialMask(u_projectionMask, colorIdx)) {
        return 0.0;
    }
    if (dot(normal, -u_projectionDir) <= u_projectionFacing) return 0.0;

    vec2 q = vec2(dot(worldPos, u_projectionU), dot(worldPos, u_projectionV))
        * u_projectionScale;
    float t = u_time * u_projectionSpeed;
    vec3 p;
    if (u_projectionPattern == 4) {
        p = vec3(q + t * 0.1, -0.3 * t);
    } else if (u_projectionPattern > 4) {
        p = vec3(q, u_projectionSeed * 43.7);
    } else {
        // Slice the volumetric fields obliquely. A flat slice at one depth
        // misses the stars, whose centers keep clear of the cell borders,
        // and cuts every drifting dust mote at the same moment.
        p = vec3(q, dot(q, vec2(0.37, 0.61))) + vec3(u_projectionSeed * 43.7);
    }

    float f = clamp(patternField(u_projectionPattern, p, t), 0.0, 1.0);
    return clamp(f * u_projectionStrength, 0.0, 1.0);
#endif
}

/**
 * The shade-row shift of a light or shadow projection in palette and
 * dithered style, up to two rows, with fractional steps dithered on the
 * shading checkerboard the way SSAO does. Negative lifts toward the lit
 * row.
 */
int projectionRowShift(float amount) {
    float rows = amount * 2.0;
    int steps = int(floor(rows));
    float frac = rows - float(steps);
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    if (frac >= 0.75 || (frac >= 0.25 && checker < 0.5)) steps += 1;
    return u_projectionMode == 0 ? -steps : steps;
}

/**
 * The projection applied after the palette lookup. Tint in every style,
 * light and shadow in smooth style, which blend toward the texel's lit or
 * darkest shade-row color instead of stepping rows.
 */
vec3 applyProjectionColor(vec3 color, float amount, vec3 litColor, vec3 darkColor) {
    if (u_projectionMode == 2) {
        return applyStyled(color, u_projectionColor, amount, u_projectionSmooth);
    }
    return mix(color, u_projectionMode == 0 ? litColor : darkColor, amount);
}

/**
 * Applies the triangle flash color by the vertex-computed envelope.
 * Flash is light on a material, not a material change so the index buffer
 * keeps the base face index, so a blink never leaves other effects' masks.
 */
vec3 applyTriangleFlash(vec3 color, float flash) {
#ifndef FX_FLASH
    return color;
#else
    if (flash <= 0.0) return color;
    if (u_flashMode == 1 && u_flashSmooth) {
        return color + u_flashColor * flash;
    }
    return applyStyled(color, u_flashColor, flash, u_flashSmooth);
#endif
}

#ifdef FX_INTERIOR
/**
 * Fakes a volume behind the surface. Marches the view ray a few steps into
 * the surface and samples a 3D pattern field at each depth. The world-space
 * construction needs no tangent basis and works on untextured faces too.
 * Layers composite far to near over the background fill, so the nearest
 * layer wins a contested pixel.
 *
 * The planar line patterns (grid, truchet, constellations) sample the
 * face's dominant world plane instead of raw 3D space. A fixed plane
 * smears into streaks on faces seen edge-on, and the fields' depth
 * coordinate cuts them into bands mid-face. Flat shading keeps the
 * chosen plane constant per face, and the 2D fields reseed per layer
 * and per axis rather than by position, so faces stay band-free.
 */
vec3 applyInterior(vec3 worldPos, vec3 viewDir, vec3 normal) {
    float t = u_time * u_interiorSpeed;
    vec3 result = u_interiorBgColor;

    bool planar = u_interiorPattern >= 4;
    vec3 an = abs(normal);
    int axis = an.x >= an.y && an.x >= an.z ? 0 : (an.y >= an.z ? 1 : 2);

    for (int i = 4; i >= 0; i--) {
        if (i >= u_interiorLayers) continue;
        float depth = u_interiorDepth * float(i + 1) / float(u_interiorLayers);
        vec3 q = worldPos - viewDir * depth;
        vec3 p;
        if (planar) {
            vec2 uv = (axis == 0 ? q.zy : (axis == 1 ? q.xz : q.xy))
                * u_interiorScale;
            p = u_interiorPattern == 4
                // pin the grid slice to the lattice plane (its time scroll
                // along z pulses a fixed slice) and drift in-plane instead
                ? vec3(uv + t * 0.1, -0.3 * t)
                : vec3(uv, float(i) + float(axis) * 37.0 + u_interiorSeed * 43.7);
        } else {
            p = q * u_interiorScale + vec3(u_interiorSeed * 43.7);
        }
        float rand;
        float f = patternField(u_interiorPattern, p, t, 0.0, rand);

        vec3 layerColor = u_interiorColor;
        if (u_interiorHueRange > 0.0) {
            float hue = (rand - 0.5) * 2.0 * u_interiorHueRange;
            layerColor = clamp(hueRotate(layerColor, hue), 0.0, 1.0);
        }

        float fade = 1.0 - 0.18 * float(i);
        result = applyStyled(result, layerColor, f * fade, u_interiorSmooth);
    }

    return result;
}
#endif

#ifdef FX_GRADLIGHT
/**
 * Two-color tint ramp: shadow color at g = 0, lit color at g = 1.
 * Palette style picks one of the two entries with a dithered transition
 * band instead of blending between them.
 */
vec3 applyGradientLight(vec3 color, float g) {
    if (u_gradLightSmooth) {
        vec3 target = mix(u_gradLightShadow, u_gradLightLit, g);
        return mix(color, target, clamp(u_gradLightBlend, 0.0, 1.0));
    }

    float sel = smoothstep(0.35, 0.65, g);
    vec3 target = ditherGate(sel) ? u_gradLightLit : u_gradLightShadow;

    return applyStyled(color, target, u_gradLightBlend, false);
}
#endif

#ifdef FX_SPECULAR
/**
 * Blinn-Phong highlight from the headlight, plus an optional two-color
 * procedural sky/ground reflection sampled by the reflected view ray.
 */
vec3 applySpecular(vec3 color, vec3 normal, vec3 viewDir, vec3 toLight, float ndv) {
    if (u_envStrength > 0.0) {
        vec3 r = reflect(-viewDir, normal);
        float w = max(1.0 - u_envHorizon, 0.001);
        float skyness = smoothstep(-w, w, r.y);
        float fres = (1.0 - ndv) * (1.0 - ndv);
        float tEnv = u_envStrength * mix(1.0, fres, u_envFresnel);

        vec3 envColor = u_specSmooth
            ? mix(u_envGround, u_envSky, skyness)
            : (ditherGate(skyness) ? u_envSky : u_envGround);

        color = applyStyled(color, envColor, tEnv, u_specSmooth);
    }

    // Flattening the normal along the camera's right axis makes horizontally
    // tilted faces catch the highlight too, stretching it into a band.
    vec3 h = normalize(toLight + viewDir);
    vec3 n = normalize(
        normal - u_specAnisotropy * dot(normal, u_cameraRight) * u_cameraRight
    );

    float exponent = exp2(1.0 + u_specSmoothness * 7.0);
    float spec = pow(max(dot(n, h), 0.0), exponent);

    return applyStyled(color, u_specColor, spec * u_specStrength, u_specSmooth);
}
#endif

#ifdef FX_RIM
/**
 * Fresnel silhouette rim. lightAlign sweeps the rim from the shadow side
 * (-1, a backlight) through the whole silhouette (0) to the lit side (+1).
 */
vec3 applyRim(vec3 color, float ndv, float lightAmount) {
    float signal = u_rimInvert ? ndv : 1.0 - ndv;
    float edge = 1.0 - u_rimWidth;
    float soft = max((1.0 - u_rimSharpness) * 0.5, 0.001);
    float t = smoothstep(edge - soft, edge + soft, signal);

    float alignWeight = u_rimLightAlign >= 0.0
        ? mix(1.0, lightAmount, u_rimLightAlign)
        : mix(1.0, 1.0 - lightAmount, -u_rimLightAlign);

    return applyStyled(color, u_rimColor, t * alignWeight * u_rimBlend, u_rimSmooth);
}
#endif

#ifdef FX_GLITTER
/**
 * Hashed sparkle cells lit through a view-angle window: each cell holds a
 * random facet direction, and the cell sparkles while the view direction
 * aligns with it, so sparkles pop in and out as the camera orbits.
 */
vec3 applyGlitter(vec3 color, vec3 worldPos, vec2 texCoord, vec3 viewDir) {
    vec3 p;
    bool is3d = u_glitterSpace == 2;
    
    if (u_glitterSpace == 0) {
        // Quantize to texel centers so sparkle edges land on texel boundaries
        vec2 uvq = (floor(texCoord * 128.0) + 0.5) / 128.0;
        p = vec3(uvq * u_glitterDensity, 0.0);
    } else if (u_glitterSpace == 1) {
        vec2 suv = (gl_FragCoord.xy - u_viewportOrigin) / u_resolution.y;
        p = vec3(suv * u_glitterDensity, 0.0);
    } else {
        p = worldPos * u_glitterDensity;
    }

    vec3 cell = floor(p);
    vec3 local = fract(p);
    vec4 h = hash43(cell);

    float halfSize = max(u_glitterSize * 0.5, 0.001);
    vec3 center = mix(vec3(halfSize), vec3(1.0 - halfSize), h.xyz);
    vec3 d = abs(local - center) / halfSize;

    if (!is3d) d.z = 0.0;
    float dist = u_glitterShape == 0 ? max(d.x, max(d.y, d.z)) : length(d);
    if (dist > 1.0) return color;

    vec3 facet = normalize(hash33(cell + 17.17) * 2.0 - 1.0);
    float a = abs(dot(facet, viewDir));
    float window = u_glitterAngleCos;
    float angleFactor = smoothstep(window, window + max((1.0 - window) * 0.35, 0.0001), a);
    if (angleFactor <= 0.0) return color;

    float twinkle = 0.55 + 0.45 * sin(6.2831853 * (h.w + u_time * u_glitterSpeed));
    float t = angleFactor * twinkle * u_glitterBrightness;

    vec3 sparkleColor = u_glitterColor;
    if (u_glitterHueRange > 0.0) {
        float hue = (hash13(cell + 41.41) - 0.5) * 2.0 * u_glitterHueRange;
        sparkleColor = clamp(hueRotate(sparkleColor, hue), 0.0, 1.0);
    }
    
    return applyStyled(color, sparkleColor, t, u_glitterSmooth);
}
#endif

/**
 * Applies the enabled material effects to the shaded base color.
 */
vec3 applyMaterialEffects(
    vec3 color,
    float colorIdx,
    vec3 normal,
    vec3 worldPos,
    vec2 texCoord,
    float lightAmount,
    vec3 toLight
) {
#if defined(FX_INTERIOR) || defined(FX_GRADLIGHT) || defined(FX_SPECULAR) || defined(FX_RIM) || defined(FX_GLITTER)
    vec3 viewDir = u_isOrtho ? -u_cameraFwd : normalize(u_cameraPos - worldPos);
    float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);
#endif

#ifdef FX_INTERIOR
    if (u_interiorEnabled && inNodeSet(NODE_INTERIOR) &&
        inMaterialMask(u_interiorMask, colorIdx)) {
        color = applyInterior(worldPos, viewDir, normal);
    }
#endif

#ifdef FX_GRADLIGHT
    if (u_gradLightEnabled && inNodeSet(NODE_GRADIENT_LIGHT) &&
        inMaterialMask(u_gradLightMask, colorIdx)) {
        float g;
        if (u_gradLightSource == 0) {
            g = lightAmount;
        } else if (u_gradLightSource == 1) {
            g = clamp((worldPos.y - u_boundsMinY) / u_boundsSpanY, 0.0, 1.0);
        } else {
            g = clamp((gl_FragCoord.y - u_viewportOrigin.y) / u_resolution.y, 0.0, 1.0);
        }
        color = applyGradientLight(color, g);
    }
#endif

#ifdef FX_SPECULAR
    if (u_specEnabled && inNodeSet(NODE_SPECULAR) &&
        inMaterialMask(u_specMask, colorIdx)) {
        color = applySpecular(color, normal, viewDir, toLight, ndv);
    }
#endif

#ifdef FX_RIM
    if (u_rimEnabled && inNodeSet(NODE_RIM_LIGHT) &&
        inMaterialMask(u_rimMask, colorIdx)) {
        color = applyRim(color, ndv, lightAmount);
    }
#endif

#ifdef FX_GLITTER
    if (u_glitterEnabled && inNodeSet(NODE_GLITTER) &&
        inMaterialMask(u_glitterMask, colorIdx)) {
        color = applyGlitter(color, worldPos, texCoord, viewDir);
    }
#endif

    return color;
}
