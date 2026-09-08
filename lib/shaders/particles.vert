#version 300 es
precision highp float;

/**
 * Stateless instanced particles. Every particle's position, motion, size,
 * color pick and twinkle phase are hashed from the instance id, so one
 * attribute-less instanced draw animates the whole system with zero CPU
 * work per frame. The particles form a lattice. The unit cell of hashed
 * positions repeats every box length in world space and each particle
 * renders the copy nearest the camera, so the field always surrounds the
 * camera while every particle stays put in world space. A motion style
 * layers procedural movement (scaled by u_speed) on top of the constant
 * directional u_velocity, moving the whole lattice so the loop stays
 * perfect. World-sized shapes shrink to nothing in the camera's immediate
 * vicinity, so a copy passing through the camera never flashes across the
 * frame.
 */

uniform mat4 u_vp;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform float u_areaSize;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec2 u_resolution;
uniform highp int u_shape; // 0 = pixel, 1 = quad, 2 = cube, 3 = triangle, 4 = line, 5 = circle
uniform float u_size;
uniform float u_sizeJitter;
uniform int u_motion; // 0 = drift, 1 = orbit, 2 = linear
uniform float u_speed;
uniform vec3 u_velocity;
uniform vec3 u_lineDir;
uniform float u_twinkle;
uniform float u_hueRange;
uniform float u_paletteBlend;
uniform sampler2D u_paletteTexture;
uniform float u_paletteIndices[16];
uniform int u_paletteCount;

#include chunks/hash.glsl;
#include chunks/color.glsl;

out vec3 v_color;
out float v_alpha;
out vec2 v_corner;

const float TAU = 6.28318530718;

const float NEAR_SHRINK = 0.1;

const vec2 QUAD[6] = vec2[6](
    vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(0.5, 0.5),
    vec2(-0.5, -0.5), vec2(0.5, 0.5), vec2(-0.5, 0.5)
);

const vec2 TRI[3] = vec2[3](
    vec2(0.0, 0.577), vec2(-0.5, -0.289), vec2(0.5, -0.289)
);

const vec3 CUBE_CORNERS[8] = vec3[8](
    vec3(-0.5, -0.5, -0.5), vec3(0.5, -0.5, -0.5),
    vec3(0.5, 0.5, -0.5), vec3(-0.5, 0.5, -0.5),
    vec3(-0.5, -0.5, 0.5), vec3(0.5, -0.5, 0.5),
    vec3(0.5, 0.5, 0.5), vec3(-0.5, 0.5, 0.5)
);

const int CUBE_IDX[36] = int[36](
    0, 2, 1, 0, 3, 2, // back
    4, 5, 6, 4, 6, 7, // front
    0, 4, 7, 0, 7, 3, // left
    1, 6, 5, 1, 2, 6, // right
    3, 7, 6, 3, 6, 2, // top
    0, 1, 5, 0, 5, 4 // bottom
);

/**
 * A one-pixel-thick streak between two world points, as a screen-space
 * quad. Endpoints behind the camera would flip under the perspective
 * divide, so such streaks collapse outside the clip volume instead.
 */
vec4 lineVertex(vec3 p0, vec3 p1, vec2 corner) {
    vec4 c0 = u_vp * vec4(p0, 1.0);
    vec4 c1 = u_vp * vec4(p1, 1.0);
    if (min(c0.w, c1.w) <= 0.0) return vec4(0.0, 0.0, 2.0, 1.0);

    vec2 dirPx = (c1.xy / c1.w - c0.xy / c0.w) * u_resolution * 0.5;
    vec2 perpPx = dot(dirPx, dirPx) > 1e-8 ? normalize(vec2(-dirPx.y, dirPx.x)) : vec2(1.0, 0.0);
    vec4 clip = corner.y < 0.0 ? c0 : c1;
    clip.xy += perpPx / u_resolution * (corner.x * 2.0) * clip.w;
    return clip;
}

void main() {
    float id = float(gl_InstanceID);
    vec4 h = hash43(vec3(id * 0.7919, 3.7, 9.1));
    vec4 h2 = hash43(vec3(id * 0.7919, 27.3, 51.7));
    float t = u_time * u_speed;

    // Motion in lattice units. "linear" adds no motion of its own and
    // moves through u_velocity alone.
    vec3 q = h.xyz;
    if (u_motion == 0) {
        q += (h2.xyz - 0.5) * 0.16 * t;
    } else if (u_motion == 1) {
        float angle = TAU * (h.x + t * 0.05 * (0.5 + h2.x));
        float radius = 0.15 + 0.35 * h2.y;
        q.xz = vec2(0.5) + radius * vec2(cos(angle), sin(angle));
    }

    // Directional movement in box lengths per second, unscaled by u_speed.
    float velJitter = 0.6 + 0.8 * hash13(vec3(id * 0.7919, 41.3, 7.7));
    q += u_velocity * (u_time * velJitter);

    // The lattice copy nearest the camera.
    vec3 cell = q - u_cameraPos / u_areaSize + 0.5;
    vec3 worldPos = u_cameraPos + (fract(cell) - 0.5) * u_areaSize;

    float near = clamp(
        length(worldPos - u_cameraPos) / (u_areaSize * NEAR_SHRINK), 0.0, 1.0
    );
    float size = u_size * (1.0 - u_sizeJitter * h2.z) * near;

    v_corner = vec2(0.0);
    if (u_shape == 2) {
        vec3 corner = CUBE_CORNERS[CUBE_IDX[gl_VertexID]];
        gl_Position = u_vp * vec4(worldPos + corner * size, 1.0);
    } else if (u_shape == 3) {
        vec2 c = TRI[gl_VertexID];
        vec3 offset = (c.x * u_cameraRight + c.y * u_cameraUp) * size;
        gl_Position = u_vp * vec4(worldPos + offset, 1.0);
    } else if (u_shape == 0) {
        // Constant screen size: for this shape, size is in output pixels
        vec2 c = QUAD[gl_VertexID];
        vec4 clip = u_vp * vec4(worldPos, 1.0);
        clip.xy += c * (size * 2.0 / u_resolution) * clip.w;
        gl_Position = clip;
    } else if (u_shape == 4) {
        vec3 reach = u_lineDir * size * 0.5;
        gl_Position = lineVertex(worldPos - reach, worldPos + reach, QUAD[gl_VertexID]);
    } else {
        vec2 c = QUAD[gl_VertexID];
        vec3 offset = (c.x * u_cameraRight + c.y * u_cameraUp) * size;
        gl_Position = u_vp * vec4(worldPos + offset, 1.0);
        v_corner = c;
    }

    // Color from the model's palette (or white when no indices are given)
    vec3 color = vec3(1.0);
    if (u_paletteCount > 0) {
        int sel = clamp(
            int(h2.w * float(u_paletteCount)), 0, u_paletteCount - 1
        );
        float idx = u_paletteIndices[sel];

        // During a dithered palette-cycle blend, each particle flips to the
        // target palette rows at its own stable point in the blend window.
        float rowSet =
            hash13(vec3(id * 0.7919, 5.3, 91.7)) < u_paletteBlend ? 0.5 : 0.0;
        color = texture(
            u_paletteTexture, vec2((idx + 0.5) / 16.0, 0.5 / 6.0 + rowSet)
        ).rgb;
    }

    if (u_hueRange > 0.0) {
        float hue = (hash13(vec3(id * 0.7919, 63.1, 17.9)) - 0.5) * 2.0 * u_hueRange;
        color = clamp(hueRotate(color, hue), 0.0, 1.0);
    }

    float twinkle =
        1.0 - u_twinkle * (0.5 + 0.5 * sin(TAU * (h.w + u_time * (0.5 + h2.y))));
    v_color = color;
    v_alpha = twinkle;
}
