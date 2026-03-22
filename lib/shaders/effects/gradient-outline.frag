#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_outlineSize;
uniform vec3 u_colorFrom;
uniform vec3 u_colorTo;
uniform float u_gradient;
uniform float u_gradientDirection;
uniform vec2 u_texelSize;
uniform vec3 u_backgroundColor;

out vec4 fragColor;

void main() {
    vec4 center = texture(u_texture, v_texCoord);

    if (center.a > 0.0) {
        fragColor = center;
        return;
    }

    int size = int(u_outlineSize);
    for (int x = -size; x <= size; x++) {
        for (int y = -size; y <= size; y++) {
            vec2 offset = vec2(float(x), float(y)) * u_texelSize;
            if (texture(u_texture, v_texCoord + offset).a > 0.0) {
                vec2 dir = vec2(cos(u_gradientDirection), sin(u_gradientDirection));
                float t = dot(v_texCoord - 0.5, dir) + 0.5;
                vec3 outColor = mix(u_colorFrom, u_colorTo, u_gradient * t);
                fragColor = vec4(outColor, 1.0);
                return;
            }
        }
    }

    fragColor = vec4(u_backgroundColor, 1.0);
}
