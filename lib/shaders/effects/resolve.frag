#version 300 es
precision highp float;

/**
 * Composites a premultiplied scene over the background color. On an opaque
 * background the effect chain expects straight color with alpha marking
 * content and the background color where nothing was drawn. While smooth
 * fades are drawn the scene pass blends premultiplied over transparent
 * black instead, so this pass flattens it back once the outlines have read
 * the true coverage. Content ends up with alpha 1, the background stays 0.
 */

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec3 u_backgroundColor;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    if (col.a <= 0.0) {
        fragColor = vec4(u_backgroundColor, 0.0);
        return;
    }
    fragColor = vec4(col.rgb + u_backgroundColor * (1.0 - col.a), 1.0);
}
