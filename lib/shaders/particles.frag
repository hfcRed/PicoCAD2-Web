#version 300 es
precision highp float;

in vec3 v_color;
in float v_alpha;

out vec4 fragColor;

void main() {
    // Premultiplied output. The particle pass blends with
    // (ONE, ONE_MINUS_SRC_ALPHA), which composites correctly over the
    // opaque scene and the premultiplied transparent-background chain alike.
    fragColor = vec4(v_color * v_alpha, v_alpha);
}
