/**
 * How the outlines follow the fades of what they trace, shared by the
 * built-in outline and the gradient outline. An uncovered pixel gathers the
 * covered pixels its dilation reaches and estimates the coverage the content
 * would have at its own position. Model pixels contribute their smallest
 * coverage in reach, so a dither hole beside intact surface reads as part
 * of the fading region instead of as silhouette, which would draw a second
 * outline where the fade begins. Scenery (the floor, the particles)
 * contributes its largest, so a faint particle passing the model never
 * dents the model's outline. The outline then fades over the upper half of
 * the coverage range and is gone by half coverage, ahead of the content.
 */

#include transparency.glsl;

uniform sampler2D u_texture;
uniform sampler2D u_indexTexture;

/** The sentinel a model estimate starts at, above any coverage. */
const float NO_MODEL_IN_REACH = 2.0;

/**
 * Folds one pixel into the estimate. Content with alpha but no recorded
 * coverage (wireframe lines, custom scene effects) is opaque. Dithered,
 * model pixels fade through the checkerboard, so their density is the
 * checkerboard's. Scenery fades through the Bayer pattern, whose density is
 * the coverage itself.
 */
void gatherCoverage(vec2 uv, inout float model, inout float scenery) {
    if (texture(u_texture, uv).a <= 0.0) return;
    vec4 index = texture(u_indexTexture, uv);
    float coverage = index.b <= 0.0 ? 1.0 : index.b;
    if (index.r >= 1.0) {
        scenery = max(scenery, coverage);
        return;
    }
    if (!u_smoothTransparency) coverage = checkerDensity(coverage);
    model = min(model, coverage);
}

/** The coverage the gathered reach amounts to, 0 when nothing covered was in reach. */
float reachCoverage(float model, float scenery) {
    return max(model >= NO_MODEL_IN_REACH ? 0.0 : model, scenery);
}

/**
 * The outline's alpha for content at a coverage. Whole pixels through the
 * Bayer gate when dithered, so the outline continues the content's pattern.
 */
float outlineAlpha(float coverage) {
    float faded = clamp(coverage * 2.0 - 1.0, 0.0, 1.0);
    if (u_smoothTransparency) return faded;
    return bayerGate(faded) ? 1.0 : 0.0;
}
