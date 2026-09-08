/**
 * How fades resolve against the background. Every fade the scene pass
 * draws (the dissolve, the floor's edge and its surface-off elements, the
 * particles' twinkle) shares this one decision. Dithered transparency
 * claims whole pixels through an ordered dither, so a frame stays
 * palette-pure and a GIF without alpha can fake the fade. Smooth
 * transparency blends fractional alpha instead.
 *
 * Fading fragments record their fade's coverage in the index attachment's
 * blue channel, so the outlines can fade the same way as the content they
 * trace. Model pixels fade through the shading checkerboard and scenery
 * (the floor, the particles) through the Bayer pattern, which the outline
 * tells apart by the palette index. It reproduces both with a single
 * Bayer gate on the density the pattern realizes. The checkerboard's only
 * fractional level, one half, is exactly the Bayer pattern's half level.
 */

uniform bool u_smoothTransparency;

/** Which fragments a model pass keeps and how it writes them. */
const int FADE_DITHERED = 0;
const int FADE_OPAQUE = 1;
const int FADE_BLENDED = 2;
uniform int u_fadePass;

/** Coverage from here on counts as opaque and belongs to the opaque pass. */
const float FADE_OPAQUE_MIN = 0.998;

/** Coverage below this rounds to nothing in an 8-bit buffer and is dropped. */
const float FADE_MIN = 1.0 / 255.0;

/** The 4x4 Bayer threshold of this pixel, 1/32 to 31/32. */
float bayerThreshold() {
    ivec2 lo = ivec2(gl_FragCoord.xy) & 1;
    ivec2 hi = (ivec2(gl_FragCoord.xy) >> 1) & 1;
    int bayer = 4 * (2 * (lo.x ^ lo.y) + lo.y) + 2 * (hi.x ^ hi.y) + hi.y;
    return (float(bayer) + 0.5) / 16.0;
}

/** Whether a coverage claims this pixel through the ordered dither. */
bool bayerGate(float coverage) {
    return coverage > bayerThreshold();
}

/**
 * The shading system's 2x2 checkerboard as an on/off gate: off below
 * 0.25, on above 0.75, checkered in between.
 */
bool checkerGate(float t) {
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    return t > (checker < 0.5 ? 0.25 : 0.75);
}

/** The density the checkerboard gate realizes at a coverage: 0, one half or 1. */
float checkerDensity(float t) {
    return t > 0.75 ? 1.0 : (t > 0.25 ? 0.5 : 0.0);
}

/** The alpha a model fragment writes: its coverage in the blended pass, a whole pixel otherwise. */
float fadeAlpha(float coverage) {
    return u_fadePass == FADE_BLENDED ? coverage : 1.0;
}
