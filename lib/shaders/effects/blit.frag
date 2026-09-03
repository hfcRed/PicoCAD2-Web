#version 300 es
precision highp float;

// Composites the post-process chain's result over the background color.

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec3 u_backgroundColor;
uniform float u_bgIsTransparent;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    // Opaque background: The chain holds straight alpha where alpha masks the
    // model, so composite over the background color at full opacity.
    // Transparent background: the chain is already premultiplied with alpha as
    // coverage (which effects may have grown or made fractional), so pass it
    // through unchanged. The drawing buffer expects premultiplied alpha.
    vec3 opaqueRgb = mix(u_backgroundColor, col.rgb, col.a);
    float outAlpha = mix(1.0, col.a, u_bgIsTransparent);
    fragColor = vec4(mix(opaqueRgb, col.rgb, u_bgIsTransparent), outAlpha);
}
