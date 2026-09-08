#version 300 es
precision highp float;

in vec3 v_color;
in float v_alpha;
in vec2 v_corner;

uniform highp int u_shape; // precisions must match the vertex stage

#include chunks/transparency.glsl;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragIndex;

void main() {
    // The circle shape is a quad with its corners cut off.
    if (u_shape == 5 && dot(v_corner, v_corner) > 0.25) discard;

    // Premultiplied output. The particle pass blends with
    // (ONE, ONE_MINUS_SRC_ALPHA), which composites correctly over the
    // opaque scene and the premultiplied transparent-background chain alike.
    // Dithered transparency gates the twinkle through the Bayer pattern
    // instead and claims whole pixels.
    float alpha = v_alpha;
    if (!u_smoothTransparency) {
        if (!bayerGate(alpha)) discard;
        alpha = 1.0;
    }
    fragColor = vec4(v_color * alpha, alpha);

    // Particles are scenery over whatever they cover, so the index keeps
    // the palette index behind them and only accumulates the twinkle's
    // coverage in blue. With a source alpha of 0 the pass's blend adds this
    // output to the destination.
    fragIndex = vec4(0.0, 0.0, v_alpha, 0.0);
}
