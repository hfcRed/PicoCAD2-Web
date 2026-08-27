#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform bool u_bgIsTransparent;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_pattern;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform float u_scale;
uniform float u_speed;
uniform float u_seed;
uniform float u_parallax;
uniform bool u_dither;
uniform vec3 u_cameraFwd;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;

#include ../chunks/patterns.glsl;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    if (u_bgIsTransparent || col.a >= 1.0) {
        fragColor = col;
        return;
    }

    float aspect = u_resolution.x / u_resolution.y;
    vec2 c = (v_texCoord - 0.5) * vec2(aspect, 1.0);

    // Screen-locked slice vs view-direction sampling (skybox),
    // blended by the parallax amount so the pattern can follow the orbit.
    vec3 pScreen = vec3(c * u_scale, u_seed * 43.7);
    vec3 ray = normalize(
        u_cameraFwd + 1.2 * (c.x * u_cameraRight + c.y * u_cameraUp)
    );
    vec3 pView = ray * u_scale + vec3(u_seed * 43.7);
    vec3 p = mix(pScreen, pView, clamp(u_parallax, 0.0, 1.0));

    float f = clamp(patternField(u_pattern, p, u_time * u_speed), 0.0, 1.0);

    if (u_dither) {
        float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
        f = f > (checker < 0.5 ? 0.25 : 0.75) ? 1.0 : 0.0;
    }

    vec3 pattern = mix(u_colorA, u_colorB, f);

    // Composite the scene's fractional coverage (outline edges) over the
    // pattern, and promote alpha so later passes treat it as content.
    fragColor = vec4(mix(pattern, col.rgb, col.a), 1.0);
}
