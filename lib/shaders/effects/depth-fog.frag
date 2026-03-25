#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform sampler2D u_depthTexture;
uniform vec3 u_fogColor;
uniform float u_near;
uniform float u_far;
uniform float u_density;
uniform int u_mode;
uniform bool u_modelOnly;

out vec4 fragColor;

float linearizeDepth(float d) {
    return (2.0 * u_near * u_far) / (u_far + u_near - d * (u_far - u_near));
}

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    float depth = texture(u_depthTexture, v_texCoord).r;
    float linearDepth = linearizeDepth(depth * 2.0 - 1.0);

    float fogFactor;

    if (u_mode == 0) {
        // Linear fog
        fogFactor = clamp((u_far - linearDepth) / (u_far - u_near), 0.0, 1.0);
    } else if (u_mode == 1) {
        // Exponential fog
        fogFactor = exp(-u_density * linearDepth);
    } else {
        // Exponential squared fog
        float f = u_density * linearDepth;
        fogFactor = exp(-f * f);
    }

    fogFactor = clamp(fogFactor, 0.0, 1.0);

    if (depth >= 0.9999) {
        fogFactor = 1.0;
    }

    vec3 result = mix(u_fogColor, col.rgb, fogFactor);

    fragColor = vec4(result, u_modelOnly ? col.a : 1.0);
}
