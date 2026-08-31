#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform sampler2D u_history;
uniform vec3 u_backgroundColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_screenType;
uniform float u_virtualRes;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_contrastBoost;
uniform float u_gridStrength;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_refreshRate;
uniform vec3 u_gbColors[4];
uniform float u_angleShift;
uniform float u_blackCrush;
uniform bool u_pentile;
uniform float u_keystone;
uniform float u_hotspot;
uniform float u_halo;
uniform float u_decay;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

#include color-mask.glsl;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragIndex;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

// RGB subpixel stripes within one virtual pixel (aperture grille / LCD triad).
// The lit channel overshoots so bright content keeps its punch after clamping.
vec3 subpixelMask(float x) {
    float s = floor(x * 3.0);
    vec3 mask = vec3(s == 0.0 ? 1.0 : 0.25, s == 1.0 ? 1.0 : 0.25, s == 2.0 ? 1.0 : 0.25);
    return mask * 1.5;
}

// Pentile approximation, cells alternate between RG and GB subpixel pairs.
vec3 pentileMask(float x, vec2 cell) {
    float s = floor(x * 2.0);
    vec3 mask;
    if (mod(cell.x + cell.y, 2.0) < 0.5) {
        mask = s == 0.0 ? vec3(1.0, 0.25, 0.25) : vec3(0.25, 1.0, 0.25);
    } else {
        mask = s == 0.0 ? vec3(0.25, 1.0, 0.25) : vec3(0.25, 0.25, 1.0);
    }
    return mask * 1.5;
}

// Screen-door darkening near virtual pixel borders.
float cellGap(vec2 cellUv) {
    vec2 d = min(cellUv, 1.0 - cellUv);
    return smoothstep(0.0, 0.12, min(d.x, d.y)) * 0.85 + 0.15;
}

void main() {
    vec2 uv = v_texCoord;

    // Screen-surface warp. Carries the palette index through below
    // (warp-duty convention). Pixels outside the screen are synthesized.
    if (u_screenType == 0) {
        // crt: barrel curvature
        uv = uv * 2.0 - 1.0;
        vec2 centered = uv;
        uv = centered * (1.0 + u_curvature * centered.yx * centered.yx);
        uv = (uv + 1.0) * 0.5;
    } else if (u_screenType == 5) {
        // projector, keystone trapezoid, image narrows toward the top
        vec2 c = uv * 2.0 - 1.0;
        c.x *= 1.0 + u_keystone * (c.y * 0.5 + 0.5);
        uv = (c + 1.0) * 0.5;
    }

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(u_bgIsTransparent ? vec3(0.0) : u_backgroundColor, 0.0);
        fragIndex = NO_MODEL_INDEX;
        return;
    }

    // Virtual pixel grid. Color is quantized per virtual pixel while the
    // subpixel/grid structure below renders at full output resolution.
    // 0 = native output pixels (no quantization, no grid).
    bool hasGrid = u_virtualRes >= 1.0;
    vec2 vres = hasGrid
        ? vec2(floor(u_virtualRes * u_resolution.x / u_resolution.y + 0.5), u_virtualRes)
        : u_resolution;
    vec2 cell = floor(uv * vres);
    vec2 cellUv = fract(uv * vres);
    vec2 sampleUV = hasGrid ? (cell + 0.5) / vres : uv;

    vec4 col = texture(u_texture, sampleUV);
    fragIndex = texture(u_indexTexture, sampleUV);

    // The premultiplied modelOnly path unpremultiplies only when a non-linear
    // transform needs straight color. Linear paths stay bit-exact premultiplied.
    bool straight = u_bgIsTransparent && u_modelOnly &&
        (u_contrastBoost != 0.0 || u_screenType == 2 || u_screenType == 3 || u_screenType == 4);
    vec3 content = (straight && col.a > 0.0) ? col.rgb / col.a : col.rgb;

    content *= u_brightness;
    content = mix(vec3(dot(content, LUMA)), content, u_saturation);
    content = (content - 0.5) * (1.0 + u_contrastBoost) + 0.5;

    if (u_screenType == 2) {
        // tn, viewing-angle shift, gamma-darkened top, washed-out bottom
        content = pow(max(content, 0.0), vec3(1.0 + u_angleShift * uv.y * 1.5));
        float wash = u_angleShift * 0.4 * (1.0 - uv.y);
        content = content * (1.0 - wash) + wash;
    } else if (u_screenType == 3) {
        // oled, crush near-black to true black (everything below half the
        // threshold goes fully dark, with a smooth shoulder above it)
        float crush = u_blackCrush * 0.3;
        content *= smoothstep(crush * 0.5, max(crush, 1e-4), dot(content, LUMA));
    } else if (u_screenType == 4) {
        // gameboy, quantize luminance to 4 shades
        float l = clamp(dot(content, LUMA), 0.0, 1.0);
        content = u_gbColors[clamp(int(l * 4.0), 0, 3)];
    }

    vec3 m = vec3(1.0);
    if (u_screenType == 0) {
        // Scanlines follow the virtual rows (output rows at native resolution)
        float rows = hasGrid ? vres.y : u_resolution.y;
        float scan = sin(uv.y * rows * 3.14159) * 0.5 + 0.5;
        m *= mix(1.0, scan, u_scanlineIntensity);

        if (hasGrid && u_gridStrength > 0.0) {
            m *= mix(vec3(1.0), subpixelMask(cellUv.x), u_gridStrength);
        }

        if (u_refreshRate > 0.0) {
            float band = fract(uv.y + u_time * u_refreshRate);
            m *= 1.0 - 0.35 * smoothstep(0.3, 0.0, band);
        }
    } else if (u_screenType == 4) {
        // gameboy, monochrome LCD screen-door, no color stripes
        if (hasGrid && u_gridStrength > 0.0) {
            m *= mix(1.0, cellGap(cellUv), u_gridStrength);
        }
    } else if (u_screenType == 5) {
        // projector, radial hotspot falloff toward the edges
        vec2 pc = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        m *= 1.0 - u_hotspot * smoothstep(0.25, 0.9, length(pc) * 1.6);
    } else if (hasGrid && u_gridStrength > 0.0) {
        // lcd / tn / oled, subpixel stripes plus screen-door gaps
        vec3 sub = (u_screenType == 3 && u_pentile)
            ? pentileMask(cellUv.x, cell)
            : subpixelMask(cellUv.x);
        m *= mix(vec3(1.0), sub * cellGap(cellUv), u_gridStrength);
    }

    vec3 halo = vec3(0.0);
    if (u_screenType == 5 && u_halo > 0.0) {
        vec2 off = 8.0 / u_resolution;
        vec3 spill = texture(u_texture, sampleUV + off).rgb
            + texture(u_texture, sampleUV - off).rgb
            + texture(u_texture, sampleUV + vec2(off.x, -off.y)).rgb
            + texture(u_texture, sampleUV + vec2(-off.x, off.y)).rgb;
        halo = spill * 0.25 * u_halo * 0.6;
    }

    vec3 sim = clamp(content * m + halo, 0.0, 1.0);

    vec4 outColor;
    if (u_bgIsTransparent) {
        if (u_modelOnly) {
            outColor = vec4(straight ? sim * col.a : sim, col.a);
        } else if (u_screenType == 0) {
            float mAvg = m.g;
            outColor = vec4(sim, (1.0 - mAvg) + col.a * mAvg);
        } else {
            outColor = vec4(sim, 1.0);
        }
    } else {
        outColor = vec4(sim, u_modelOnly ? col.a : 1.0);
    }

    if (u_decay > 0.0) {
        // Prevent permanent ghosting by ensuring a minimum per-frame step for each channel
        vec4 diff = texture(u_history, v_texCoord) - outColor;
        vec4 dist = max(min(abs(diff) * u_decay, abs(diff) - 1.0 / 255.0), 0.0);
        outColor += sign(diff) * dist;
    }

    fragColor = outColor;
}
