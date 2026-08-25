uniform sampler2D u_indexTexture;
uniform int u_colorMask;

/**
 * Index value for pixels a warping effect synthesizes instead of fetching
 * from its input (e.g. background fill outside a distorted screen).
 * R = 255 marks "no model pixel" so masks never match invented content.
 */
const vec4 NO_MODEL_INDEX = vec4(1.0, 0.0, 0.0, 0.0);

/**
 * Returns true if the pixel at uv should receive the effect.
 * u_colorMask is a bitmask of base palette indices (bit n = color n).
 * A mask of 0 means no colors are selected, which applies the effect
 * everywhere (empty colors array semantics). The index texture stores the
 * base palette index in R with 255 marking non-model pixels, so a
 * non-empty mask never matches background or outline pixels.
 */
bool inColorMask(vec2 uv) {
    if (u_colorMask == 0) return true;
    int idx = int(texture(u_indexTexture, uv).r * 255.0 + 0.5);
    return idx < 16 && ((u_colorMask >> idx) & 1) != 0;
}
