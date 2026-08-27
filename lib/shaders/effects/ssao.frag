#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform sampler2D u_depthTexture;
uniform sampler2D u_paletteTexture;
uniform mat4 u_proj;
uniform mat4 u_invProj;
uniform float u_radius;
uniform float u_intensity;
uniform float u_power;
uniform int u_samples;
uniform bool u_smooth;
uniform bool u_orthographic;
uniform bool u_bgIsTransparent;

#include color-mask.glsl;

out vec4 fragColor;

const float GOLDEN_ANGLE = 2.39996323;

/**
 * Reconstructs the view-space position for a pixel by unprojecting its
 * depth through the inverse projection matrix. Works for all three
 * projection modes (perspective / fisheye / orthographic) since they all
 * go through matrices.
 */
vec3 viewPos(vec2 uv) {
    float d = texture(u_depthTexture, uv).r;
    vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 p = u_invProj * ndc;
    return p.xyz / p.w;
}

/** Interleaved gradient noise. A stable per-pixel kernel rotation. */
float ign(vec2 px) {
    return fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
}

void main() {
    vec4 col = texture(u_texture, v_texCoord);

    vec3 P = viewPos(v_texCoord);
    vec3 dPdx = dFdx(P);
    vec3 dPdy = dFdy(P);

    vec4 idx = texture(u_indexTexture, v_texCoord);
    int base = int(idx.r * 255.0 + 0.5);
    if (base >= 16 || !inColorMask(v_texCoord)) {
        fragColor = col;
        return;
    }

    vec3 N = normalize(cross(dPdx, dPdy));
    vec3 toPoint = u_orthographic ? vec3(0.0, 0.0, -1.0) : normalize(P);
    if (dot(N, toPoint) > 0.0) N = -N;

    vec3 up = abs(N.z) < 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(cross(up, N));
    vec3 B = cross(N, T);

    // Golden-angle spiral hemisphere kernel, rotated per pixel. View space is
    // a rigid transform of world space, so u_radius is in world units.
    float rot = ign(floor(gl_FragCoord.xy)) * 6.2831853;
    float bias = 0.02 * u_radius + 0.005;
    float occlusion = 0.0;
    float count = 0.0;

    for (int i = 0; i < 32; i++) {
        if (i >= u_samples) break;
        float fi = float(i) + 0.5;
        float ang = fi * GOLDEN_ANGLE + rot;
        float r = sqrt(fi / float(u_samples));
        float h = sqrt(max(1.0 - r * r, 0.0));
        vec3 dir = T * (cos(ang) * r) + B * (sin(ang) * r) + N * h;
        vec3 sp = P + dir * (u_radius * (0.2 + 0.8 * fi / float(u_samples)));

        vec4 clip = u_proj * vec4(sp, 1.0);
        if (clip.w <= 0.0) continue;
        vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
        count += 1.0;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

        float sceneZ = viewPos(suv).z;

        if (sceneZ >= sp.z + bias) {
            occlusion += smoothstep(0.0, 1.0, u_radius / abs(P.z - sceneZ));
        }
    }

    float ao = clamp(pow(occlusion / max(count, 1.0), u_power) * u_intensity, 0.0, 1.0);

    if (u_smooth) {
        fragColor = vec4(col.rgb * (1.0 - ao), col.a);
        return;
    }

    // Palette style AO picks a deeper shade row for the pixel's base index,
    // dithering fractional levels with the shading system's checkerboard, so
    // every output pixel stays a legal palette entry.
    int row = int(idx.g * 255.0 + 0.5);
    float shift = ao * 2.0;
    int darken = int(floor(shift));
    float frac = shift - float(darken);
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    if (frac >= 0.75 || (frac >= 0.25 && checker < 0.5)) darken += 1;

    int newRow = clamp(row + darken, 0, 2);
    if (newRow == row) {
        fragColor = col;
        return;
    }

    vec2 lookup = vec2((float(base) + 0.5) / 16.0, (float(newRow) + 0.5) / 3.0);
    vec3 shaded = texture(u_paletteTexture, lookup).rgb;
    fragColor = vec4(u_bgIsTransparent ? shaded * col.a : shaded, col.a);
}
