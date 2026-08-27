#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_outlineSize;
uniform vec3 u_colorFrom;
uniform vec3 u_colorTo;
uniform float u_gradient;
uniform float u_gradientDirection;
uniform float u_growthDirection;
uniform float u_growthFactor;
uniform int u_mode; // 0 = outline, 1 = dropShadow
uniform vec2 u_shadowOffset;
uniform vec2 u_texelSize;
uniform vec3 u_backgroundColor;
uniform bool u_bgIsTransparent;

out vec4 fragColor;

vec4 outlineColor() {
    vec2 dir = vec2(cos(u_gradientDirection), sin(u_gradientDirection));
    float t = dot(v_texCoord - 0.5, dir) + 0.5;
    return vec4(mix(u_colorFrom, u_colorTo, u_gradient * t), 1.0);
}

void main() {
    vec4 center = texture(u_texture, v_texCoord);

    if (center.a > 0.0) {
        fragColor = center;
        return;
    }

    int size = int(u_outlineSize);

    if (u_mode == 1) {
        // Drop shadow. The silhouette is looked up displaced by the shadow
        // offset (so pixel P is shadowed when the model covers P - offset),
        // with the outline size still fattening the shadow shape.
        vec2 base = v_texCoord - u_shadowOffset * u_texelSize;
        for (int x = -size; x <= size; x++) {
            for (int y = -size; y <= size; y++) {
                vec2 offset = vec2(float(x), float(y)) * u_texelSize;
                if (texture(u_texture, base + offset).a > 0.0) {
                    fragColor = outlineColor();
                    return;
                }
            }
        }
    } else {
        // The outline grows from the model opposite to the sample offset, so
        // each dilation sample is weighted by how well -offset aligns with the
        // growth direction. At growth factor 0 every weight is 1 and the
        // Chebyshev test accepts the whole box.
        vec2 dir = vec2(cos(u_growthDirection), sin(u_growthDirection));
        for (int x = -size; x <= size; x++) {
            for (int y = -size; y <= size; y++) {
                vec2 off = vec2(float(x), float(y));
                float cheb = max(abs(off.x), abs(off.y));
                float weight = 1.0;
                if (u_growthFactor > 0.0 && cheb > 0.0) {
                    float align = dot(-normalize(off), dir);
                    weight = mix(1.0, max(align, 0.0), u_growthFactor);
                }
                if (cheb > u_outlineSize * weight + 0.0001) continue;
                if (texture(u_texture, v_texCoord + off * u_texelSize).a > 0.0) {
                    fragColor = outlineColor();
                    return;
                }
            }
        }
    }

    fragColor = vec4(u_bgIsTransparent ? vec3(0.0) : u_backgroundColor, 0.0);
}
