#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_texCoord;
in float v_colorIndex;
in float v_faceFlags;

uniform sampler2D u_indexTexture;
uniform sampler2D u_paletteTexture;
uniform vec3 u_lightDir;
uniform float u_ambient;
uniform float u_transparentColor;
uniform bool u_shadingEnabled;
uniform int u_renderMode; // 0 = texture, 1 = color

out vec4 fragColor;

void main() {
    int flags = int(v_faceFlags + 0.5);
    bool noShade = (flags & 1) != 0;
    bool noTex = (flags & 2) != 0;

    float colorIdx;
    bool fromTexture = (u_renderMode == 0 && !noTex);
    if (fromTexture) {
        float texSample = texture(u_indexTexture, v_texCoord).r;
        colorIdx = floor(texSample * 255.0 + 0.5);

        // Discard transparent pixels
        if (abs(colorIdx - u_transparentColor) < 0.5) {
            discard;
        }
    } else {
        colorIdx = v_colorIndex;
    }

    // Compute shading level
    int paletteRow = 0;
    if (u_shadingEnabled && !noShade) {
        vec3 normal = normalize(v_normal);
        float rawDot = -dot(normal, u_lightDir);
        float lightFactor = 1.0 - (1.0 - rawDot) * (1.0 - rawDot);
        lightFactor = clamp(lightFactor, u_ambient, 1.0);

        if (lightFactor < 0.4) {
            paletteRow = 2;
        } else if (lightFactor < 0.56) {
            paletteRow = 1;
        } else if (lightFactor < 0.75) {
            // Dithering
            float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
            paletteRow = checker < 0.5 ? 1 : 0;
        }
    }

    float u = (colorIdx + 0.5) / 16.0;
    float v = (float(paletteRow) + 0.5) / 3.0;
    vec3 color = texture(u_paletteTexture, vec2(u, v)).rgb;

    fragColor = vec4(color, 1.0);
}
