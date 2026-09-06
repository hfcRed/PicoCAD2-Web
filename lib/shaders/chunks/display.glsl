/**
 * The display material effect. The screen simulation the video effects
 * post pass runs over the frame (screen.glsl), applied per material on the
 * surface instead. In uv space the surface is the screen, the virtual
 * pixel grid lies on the texture, scanlines run along texel rows, the
 * subpixel structure sits inside each cell, and the texel lookup snaps to
 * the cell centers when the grid is coarser than the texture (see
 * displayTexCoord). In screen space the structure follows the output
 * pixels like the post pass, but without resampling, since a fragment only
 * knows its own color. Warps, the projector's halo and ghosting stay with
 * the post pass. The simulation only compiles into program variants that
 * define FX_DISPLAY, no material is a display in the others.
 */

#include node-bits.glsl;
#ifdef FX_DISPLAY
#include screen.glsl;
#endif

uniform bool u_displayEnabled;
uniform int u_displaySpace; // 0 = uv, 1 = screen
uniform int u_displayType;
uniform float u_displayRes;
uniform float u_displayBrightness;
uniform float u_displaySaturation;
uniform float u_displayContrast;
uniform float u_displayGrid;
uniform float u_displayScanlines;
uniform float u_displayRefresh;
uniform vec3 u_displayShades[4];
uniform float u_displayAngle;
uniform float u_displayCrush;
uniform bool u_displayPentile;
uniform float u_displayHotspot;
uniform int u_displayMask;

/** The texture's size in texels, the uv space's own pixels. */
const vec2 DISPLAY_TEXELS = vec2(128.0);

/** Whether the fragment's material is a display. Same mask semantics as the other material effects (0 = all). */
bool displayActive(float colorIdx) {
#ifndef FX_DISPLAY
    return false;
#else
    if (!u_displayEnabled || !inNodeSet(NODE_DISPLAY)) return false;
    if (u_displayMask == 0) return true;
    int idx = int(colorIdx + 0.5);
    return idx < 16 && ((u_displayMask >> idx) & 1) != 0;
#endif
}

#ifdef FX_DISPLAY

/**
 * The uv-space screen position of a texel. The texture's v runs down from
 * its top row while the screen functions count y up from the bottom (the
 * refresh band rolls down, TN darkens the top), so v is flipped.
 */
vec2 displayUv(vec2 texCoord) {
    return vec2(texCoord.x, 1.0 - texCoord.y);
}

/**
 * Where the texture is looked up for a fragment on a display. The center
 * of its virtual pixel in uv space, so a grid coarser than the texels
 * shows a coarser image. Unchanged in screen space or without a grid.
 */
vec2 displayTexCoord(vec2 texCoord) {
    if (u_displaySpace != 0 || u_displayRes < 1.0) return texCoord;
    vec2 snapped = screenGrid(displayUv(texCoord), u_displayRes, DISPLAY_TEXELS).sampleUv;
    return vec2(snapped.x, 1.0 - snapped.y);
}

/**
 * Runs the screen simulation over the shaded color. The screen space is
 * the texture or the output pixels, with the matching position and size.
 */
vec3 applyDisplay(vec3 color, vec2 texCoord, vec2 screenUv, vec2 resolution, float time) {
    bool onTexture = u_displaySpace == 0;
    vec2 uv = onTexture ? displayUv(texCoord) : screenUv;
    vec2 space = onTexture ? DISPLAY_TEXELS : resolution;
    ScreenGrid g = screenGrid(uv, u_displayRes, space);

    vec3 c = screenTone(color, u_displayBrightness, u_displaySaturation, u_displayContrast);
    c = screenResponse(c, u_displayType, uv.y, u_displayAngle, u_displayCrush, u_displayShades);
    vec3 m = screenStructure(
        u_displayType, g, uv, space, u_displayScanlines, u_displayGrid,
        u_displayPentile, u_displayRefresh, time, u_displayHotspot
    );
    return clamp(c * m, 0.0, 1.0);
}
#else
vec2 displayTexCoord(vec2 texCoord) {
    return texCoord;
}

vec3 applyDisplay(vec3 color, vec2 texCoord, vec2 screenUv, vec2 resolution, float time) {
    return color;
}
#endif
