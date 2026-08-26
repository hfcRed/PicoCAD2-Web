/**
 * Material effects applied inside the model shader: interior, rim light,
 * gradient light, specular + environment reflection, and glitter. Self-contained:
 * declares its own uniforms and receives all per-fragment inputs as
 * parameters of applyMaterialEffects().
 *
 * Every effect supports two styles. Palette style (u_*Smooth = false) only
 * ever outputs the effect color passed from the CPU (which is snapped to a
 * palette entry there) and converts soft intensities into the same 2x2
 * checkerboard dithering the shading system uses, so the render stays made
 * of palette entries. Smooth style does plain RGB blending.
 *
 * Masks test the base palette index before the shade-row lookup, so they
 * select materials whether lit or in shadow, mirroring the post-effect
 * mask implementation. The material pass never changes the index G-buffer:
 * a rim or sparkle is light on a material instead of a material change.
 */

#include patterns.glsl;

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
uniform vec3 u_interiorColor;
uniform vec3 u_interiorBgColor;
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

/** Rotates a color's hue by an angle in radians (around the gray axis). */
vec3 hueRotate(vec3 c, float angle) {
    const vec3 k = vec3(0.57735026919);
    float cosA = cos(angle);
    return c * cosA + cross(k, c) * sin(angle) + k * dot(k, c) * (1.0 - cosA);
}

/**
 * Fakes a volume behind the surface. Marches the view ray a few steps into
 * the surface and samples a 3D pattern field at each depth. The world-space
 * construction needs no tangent basis and works on untextured faces too.
 * Layers composite far to near over the background fill, so the nearest
 * layer wins a contested pixel.
 */
vec3 applyInterior(vec3 worldPos, vec3 viewDir) {
    float t = u_time * u_interiorSpeed;
    vec3 result = u_interiorBgColor;

    for (int i = 3; i >= 0; i--) {
        if (i >= u_interiorLayers) continue;
        float depth = u_interiorDepth * float(i + 1) / float(u_interiorLayers);
        vec3 p = (worldPos - viewDir * depth) * u_interiorScale;
        float f = patternField(u_interiorPattern, p, t);

        float fade = 1.0 - 0.15 * float(i);
        result = applyStyled(result, u_interiorColor, f * fade, u_interiorSmooth);
    }

    return result;
}

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
    if (u_glitterSmooth && u_glitterHueRange > 0.0) {
        float hue = (hash13(cell + 41.41) - 0.5) * 2.0 * u_glitterHueRange;
        sparkleColor = clamp(hueRotate(sparkleColor, hue), 0.0, 1.0);
    }
    
    return applyStyled(color, sparkleColor, t, u_glitterSmooth);
}

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
    vec3 viewDir = u_isOrtho ? -u_cameraFwd : normalize(u_cameraPos - worldPos);
    float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);

    if (u_interiorEnabled && inMaterialMask(u_interiorMask, colorIdx)) {
        color = applyInterior(worldPos, viewDir);
    }

    if (u_gradLightEnabled && inMaterialMask(u_gradLightMask, colorIdx)) {
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

    if (u_specEnabled && inMaterialMask(u_specMask, colorIdx)) {
        color = applySpecular(color, normal, viewDir, toLight, ndv);
    }

    if (u_rimEnabled && inMaterialMask(u_rimMask, colorIdx)) {
        color = applyRim(color, ndv, lightAmount);
    }

    if (u_glitterEnabled && inMaterialMask(u_glitterMask, colorIdx)) {
        color = applyGlitter(color, worldPos, texCoord, viewDir);
    }

    return color;
}
