#version 300 es
precision highp float;

/**
 * Whole-display screen simulation over the frame. Warps the screen
 * surface, samples the scene once per virtual pixel, and runs the shared
 * screen simulation (../chunks/screen.glsl) over it, plus the projector's
 * halo and the phosphor or LCD ghosting that need the whole frame.
 */

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

#include ../chunks/screen.glsl;
#include color-mask.glsl;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragIndex;

void main() {
    vec2 uv = v_texCoord;

    // Screen-surface warp. Carries the palette index through below
    // (warp-duty convention). Pixels outside the screen are synthesized.
    if (u_screenType == SCREEN_CRT) {
        // crt: barrel curvature
        uv = uv * 2.0 - 1.0;
        vec2 centered = uv;
        uv = centered * (1.0 + u_curvature * centered.yx * centered.yx);
        uv = (uv + 1.0) * 0.5;
    } else if (u_screenType == SCREEN_PROJECTOR) {
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
    ScreenGrid g = screenGrid(uv, u_virtualRes, u_resolution);

    vec4 col = texture(u_texture, g.sampleUv);
    fragIndex = texture(u_indexTexture, g.sampleUv);

    // The premultiplied modelOnly path unpremultiplies only when a non-linear
    // transform needs straight color. Linear paths stay bit-exact premultiplied.
    bool straight = u_bgIsTransparent && u_modelOnly &&
        (u_contrastBoost != 0.0 || u_screenType == SCREEN_TN ||
            u_screenType == SCREEN_OLED || u_screenType == SCREEN_GAMEBOY);
    vec3 content = (straight && col.a > 0.0) ? col.rgb / col.a : col.rgb;

    content = screenTone(content, u_brightness, u_saturation, u_contrastBoost);
    content = screenResponse(
        content, u_screenType, uv.y, u_angleShift, u_blackCrush, u_gbColors
    );

    vec3 m = screenStructure(
        u_screenType, g, uv, u_resolution, u_scanlineIntensity, u_gridStrength,
        u_pentile, u_refreshRate, u_time, u_hotspot
    );

    vec3 halo = vec3(0.0);
    if (u_screenType == SCREEN_PROJECTOR && u_halo > 0.0) {
        vec2 off = 8.0 / u_resolution;
        vec3 spill = texture(u_texture, g.sampleUv + off).rgb
            + texture(u_texture, g.sampleUv - off).rgb
            + texture(u_texture, g.sampleUv + vec2(off.x, -off.y)).rgb
            + texture(u_texture, g.sampleUv + vec2(-off.x, off.y)).rgb;
        halo = spill * 0.25 * u_halo * 0.6;
    }

    vec3 sim = clamp(content * m + halo, 0.0, 1.0);

    vec4 outColor;
    if (u_bgIsTransparent) {
        if (u_modelOnly) {
            outColor = vec4(straight ? sim * col.a : sim, col.a);
        } else if (u_screenType == SCREEN_CRT) {
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
