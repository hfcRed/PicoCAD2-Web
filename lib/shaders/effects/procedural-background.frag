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
uniform float u_camAzimuth;
uniform float u_camElevation;

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
    float ft = u_time * u_speed;
    float parallax = clamp(u_parallax, 0.0, 1.0);

    vec3 p;
    float period = 0.0;
    if (u_pattern >= 4) {
        // grid / truchet / constellations are planar line patterns. The 3D
        // ray domain below slices them into bands (floor(p.z) variant seams
        // for the 2D fields, lattice cross-sections for the grid). Keep them
        // on the screen plane and scroll with the orbit angles instead,
        // matching world-fixed motion at the screen center.
        float turnCells = parallax * PATTERN_TAU * u_scale / 1.2;
        float visCells = u_scale * aspect;
        float snapped = floor(turnCells + 0.5);
        bool wrap = snapped >= visCells + 1.0;

        float az = wrap ? mod(u_camAzimuth, PATTERN_TAU) : u_camAzimuth;
        vec2 q = c * u_scale;
        q.x -= az * (wrap ? snapped : turnCells) / PATTERN_TAU;
        q.y -= u_camElevation * parallax * u_scale / 1.2;
        if (wrap) {
            q.x = mod(q.x, snapped);
            period = snapped;
        }

        if (u_pattern == 4) {
            p = vec3(q + ft * 0.1, -0.3 * ft);
        } else {
            p = vec3(q, u_seed * 43.7);
        }
    } else {
        // Volumetric fields. Screen-locked slice vs view-direction sampling
        // (skybox), blended by the parallax amount to follow the orbit.
        float az = u_camAzimuth * parallax;
        float el = u_camElevation * parallax;
        float ca = cos(az), sa = sin(az), ce = cos(el), se = sin(el);

        vec3 fwd = -vec3(ca * ce, se, sa * ce);
        vec3 right = vec3(sa, 0.0, -ca);
        vec3 up = vec3(-se * ca, ce, -se * sa);
        vec3 ray = normalize(fwd + 1.2 * (-c.x * right + c.y * up));

        p = ray * u_scale + vec3(u_seed * 43.7);
    }

    float f = clamp(patternField(u_pattern, p, ft, period), 0.0, 1.0);

    if (u_dither) {
        float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
        f = f > (checker < 0.5 ? 0.25 : 0.75) ? 1.0 : 0.0;
    }

    vec3 pattern = mix(u_colorA, u_colorB, f);

    // Composite the scene's fractional coverage (outline edges) over the
    // pattern, and promote alpha so later passes treat it as content.
    fragColor = vec4(mix(pattern, col.rgb, col.a), 1.0);
}
