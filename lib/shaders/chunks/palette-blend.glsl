/**
 * Palette-cycle dither blend, for fragment shaders sampling the 16x6
 * palette LUT. Rows 0-2 hold the current display palette, rows 3-5 the
 * palette of the upcoming cycle step. While a dithered blend runs, a 4x4
 * Bayer threshold flips pixels to the target rows one dither level at a
 * time, so the transition dissolves in instead of snapping.
 */

uniform float u_paletteBlend;

/**
 * The v-offset selecting the palette row set for this pixel: 0.0 samples
 * the current palette (rows 0-2), 0.5 the blend target (rows 3-5).
 */
float paletteBlendOffset() {
    if (u_paletteBlend <= 0.0) return 0.0;

    // Standard 4x4 Bayer matrix from its 2x2 base pattern 2*(x^y) + y,
    // giving 16 ordered thresholds per tile.
    ivec2 lo = ivec2(gl_FragCoord.xy) & 1;
    ivec2 hi = (ivec2(gl_FragCoord.xy) >> 1) & 1;
    int bayer = 4 * (2 * (lo.x ^ lo.y) + lo.y) + 2 * (hi.x ^ hi.y) + hi.y;

    return u_paletteBlend > (float(bayer) + 0.5) / 16.0 ? 0.5 : 0.0;
}
