/**
 * The screen simulation shared by the video effects post pass and the
 * display material effect. The virtual pixel grid, the tone controls, each
 * screen type's color response and the structure it lays over the content.
 * Pure functions of a position in a screen space, so the post pass runs
 * them over the frame and the material effect over a texture or the output
 * pixels under a material. Warps, the projector's halo and ghosting need
 * the whole frame and stay in the post pass.
 */

const vec3 SCREEN_LUMA = vec3(0.299, 0.587, 0.114);

const int SCREEN_CRT = 0;
const int SCREEN_LCD = 1;
const int SCREEN_TN = 2;
const int SCREEN_OLED = 3;
const int SCREEN_GAMEBOY = 4;
const int SCREEN_PROJECTOR = 5;

struct ScreenGrid {
    bool hasGrid;
    vec2 vres;
    vec2 cell;
    vec2 cellUv;
    vec2 sampleUv;
};

/**
 * The virtual pixel grid over a space of `space` pixels, `virtualRes`
 * virtual pixels along its height. Color is meant to be sampled once per
 * virtual pixel, at sampleUv, while the structure renders per output
 * pixel, which is what makes it read as a screen instead of downscaled
 * pixelation. Below 1 there is no grid and the space's own pixels are the
 * cells.
 */
ScreenGrid screenGrid(vec2 uv, float virtualRes, vec2 space) {
    ScreenGrid g;
    g.hasGrid = virtualRes >= 1.0;
    g.vres = g.hasGrid
        ? vec2(floor(virtualRes * space.x / space.y + 0.5), virtualRes)
        : space;
    g.cell = floor(uv * g.vres);
    g.cellUv = fract(uv * g.vres);
    g.sampleUv = g.hasGrid ? (g.cell + 0.5) / g.vres : uv;
    return g;
}

/** Brightness, saturation and contrast, in that order. */
vec3 screenTone(vec3 c, float brightness, float saturation, float contrastBoost) {
    c *= brightness;
    c = mix(vec3(dot(c, SCREEN_LUMA)), c, saturation);
    return (c - 0.5) * (1.0 + contrastBoost) + 0.5;
}

/**
 * A screen type's own color response. TN darkens the top through gamma
 * and washes out the bottom by the vertical position, OLED crushes
 * near-black to true black (everything below half the threshold goes
 * fully dark, with a smooth shoulder above it), gameboy quantizes the
 * luminance to four shades.
 */
vec3 screenResponse(vec3 c, int type, float y, float angleShift, float blackCrush, vec3 shades[4]) {
    if (type == SCREEN_TN) {
        c = pow(max(c, 0.0), vec3(1.0 + angleShift * y * 1.5));
        float wash = angleShift * 0.4 * (1.0 - y);
        return c * (1.0 - wash) + wash;
    }
    if (type == SCREEN_OLED) {
        float crush = blackCrush * 0.3;
        return c * smoothstep(crush * 0.5, max(crush, 1e-4), dot(c, SCREEN_LUMA));
    }
    if (type == SCREEN_GAMEBOY) {
        float l = clamp(dot(c, SCREEN_LUMA), 0.0, 1.0);
        return shades[clamp(int(l * 4.0), 0, 3)];
    }
    return c;
}

/**
 * RGB subpixel stripes within one virtual pixel (aperture grille / LCD
 * triad). The lit channel overshoots so bright content keeps its punch
 * after clamping.
 */
vec3 subpixelMask(float x) {
    float s = floor(x * 3.0);
    vec3 mask = vec3(s == 0.0 ? 1.0 : 0.25, s == 1.0 ? 1.0 : 0.25, s == 2.0 ? 1.0 : 0.25);
    return mask * 1.5;
}

/** Pentile approximation, cells alternate between RG and GB subpixel pairs. */
vec3 pentileMask(float x, vec2 cell) {
    float s = floor(x * 2.0);
    vec3 mask;
    if (mod(cell.x + cell.y, 2.0) < 0.5) {
        mask = s == 0.0 ? vec3(1.0, 0.25, 0.25) : vec3(0.25, 1.0, 0.25);
    } else {
        mask = s == 0.0 ? vec3(0.25, 1.0, 0.25) : vec3(0.25, 0.25, 1.0);
    }
    return mask * 1.5;
}

/** Screen-door darkening near virtual pixel borders. */
float cellGap(vec2 cellUv) {
    vec2 d = min(cellUv, 1.0 - cellUv);
    return smoothstep(0.0, 0.12, min(d.x, d.y)) * 0.85 + 0.15;
}

/**
 * The structure a screen lays over its content, as a multiplier. A CRT's
 * scanlines along the virtual rows, its grille and its rolling refresh
 * band, a gameboy's monochrome screen-door, the projector's radial
 * hotspot falloff, and the panels' subpixel stripes with screen-door gaps.
 */
vec3 screenStructure(
    int type,
    ScreenGrid g,
    vec2 uv,
    vec2 space,
    float scanlineIntensity,
    float gridStrength,
    bool pentile,
    float refreshRate,
    float time,
    float hotspot
) {
    vec3 m = vec3(1.0);
    if (type == SCREEN_CRT) {
        float rows = g.hasGrid ? g.vres.y : space.y;
        float scan = sin(uv.y * rows * 3.14159) * 0.5 + 0.5;
        m *= mix(1.0, scan, scanlineIntensity);

        if (g.hasGrid && gridStrength > 0.0) {
            m *= mix(vec3(1.0), subpixelMask(g.cellUv.x), gridStrength);
        }

        if (refreshRate > 0.0) {
            float band = fract(uv.y + time * refreshRate);
            m *= 1.0 - 0.35 * smoothstep(0.3, 0.0, band);
        }
    } else if (type == SCREEN_GAMEBOY) {
        if (g.hasGrid && gridStrength > 0.0) {
            m *= mix(1.0, cellGap(g.cellUv), gridStrength);
        }
    } else if (type == SCREEN_PROJECTOR) {
        vec2 pc = (uv - 0.5) * vec2(space.x / space.y, 1.0);
        m *= 1.0 - hotspot * smoothstep(0.25, 0.9, length(pc) * 1.6);
    } else if (g.hasGrid && gridStrength > 0.0) {
        vec3 sub = (type == SCREEN_OLED && pentile)
            ? pentileMask(g.cellUv.x, g.cell)
            : subpixelMask(g.cellUv.x);
        m *= mix(vec3(1.0), sub * cellGap(g.cellUv), gridStrength);
    }
    return m;
}
