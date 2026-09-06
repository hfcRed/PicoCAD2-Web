#version 300 es
precision highp float;

/**
 * PicoCAD 2's outline. Paints the outline color on every uncovered pixel
 * within the outline size of a covered one. The outline fades with what it
 * traces, see chunks/outline-fade.glsl.
 */

in vec2 v_texCoord;

uniform float u_outlineSize;
uniform vec3 u_outlineColor;
uniform vec2 u_texelSize;
uniform vec3 u_backgroundColor;
uniform bool u_premultiplied;

#include chunks/outline-fade.glsl;

out vec4 fragColor;

void main() {
    vec4 center = texture(u_texture, v_texCoord);

    if (center.a > 0.0) {
        fragColor = center;
        return;
    }

    int size = int(u_outlineSize);
    float model = NO_MODEL_IN_REACH;
    float scenery = 0.0;
    for (int x = -size; x <= size; x++) {
        for (int y = -size; y <= size; y++) {
            vec2 offset = vec2(float(x), float(y)) * u_texelSize;
            gatherCoverage(v_texCoord + offset, model, scenery);
        }
    }

    float alpha = outlineAlpha(reachCoverage(model, scenery));
    if (alpha > 0.0) {
        fragColor = vec4(u_outlineColor * alpha, alpha);
        return;
    }

    fragColor = vec4(u_premultiplied ? vec3(0.0) : u_backgroundColor, 0.0);
}
