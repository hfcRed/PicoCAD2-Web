#version 300 es
precision highp float;

/**
 * Stateless instanced particles. Every particle's position, motion, size,
 * color pick and twinkle phase are hashed from the instance id, so one
 * attribute-less instanced draw animates the whole system with zero CPU
 * work per frame. Positions wrap inside a unit box, so motion loops
 * perfectly. Size scales to zero toward the edge of the volume's inscribed
 * ellipsoid so the wrap never pops.
 */

uniform mat4 u_vp;
uniform float u_time;
uniform vec3 u_areaCenter;
uniform vec3 u_areaSize;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec2 u_resolution;
uniform int u_shape; // 0 = pixel, 1 = quad, 2 = cube, 3 = triangle
uniform float u_size;
uniform float u_sizeJitter;
uniform int u_motion; // 0 = drift, 1 = rise, 2 = fall, 3 = orbit, 4 = swirl
uniform float u_speed;
uniform float u_twinkle;
uniform float u_hueRange;
uniform sampler2D u_paletteTexture;
uniform float u_paletteIndices[16];
uniform int u_paletteCount;

#include chunks/hash.glsl;
#include chunks/color.glsl;

out vec3 v_color;
out float v_alpha;

const float TAU = 6.28318530718;

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

void main() {
    float id = float(gl_InstanceID);
    vec4 h = hash43(vec3(id * 0.7919, 3.7, 9.1));
    vec4 h2 = hash43(vec3(id * 0.7919, 27.3, 51.7));
    float t = u_time * u_speed;

    // Motion in the unit box, wrapped for a perfect loop
    vec3 q = h.xyz;
    if (u_motion == 0) {
        q += (h2.xyz - 0.5) * 0.16 * t;
    } else if (u_motion == 1) {
        q.y += t * (0.06 + 0.08 * h2.x);
        q.x += 0.02 * sin(TAU * (h2.y + t * 0.3));
    } else if (u_motion == 2) {
        q.y -= t * (0.06 + 0.08 * h2.x);
        q.x += 0.02 * sin(TAU * (h2.y + t * 0.3));
    } else {
        float angle = TAU * (h.x + t * 0.05 * (0.5 + h2.x));
        float radius = 0.15 + 0.35 * h2.y;
        q.xz = vec2(0.5) + radius * vec2(cos(angle), sin(angle));
        q.y = u_motion == 4 ? h.y + t * 0.05 : h.y;
    }
    q = fract(q);

    vec3 worldPos = u_areaCenter + (q - vec3(0.5)) * u_areaSize;

    // Scale in after spawning and back out before despawning. Size follows
    // the radial distance from the volume's center.
    float grow = smoothstep(0.0, 0.15, 1.0 - 2.0 * length(q - 0.5));

    float size = u_size * (1.0 - u_sizeJitter * h2.z) * grow;

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
    } else {
        vec2 c = QUAD[gl_VertexID];
        vec3 offset = (c.x * u_cameraRight + c.y * u_cameraUp) * size;
        gl_Position = u_vp * vec4(worldPos + offset, 1.0);
    }

    // Color from the model's palette (or white when no indices are given)
    vec3 color = vec3(1.0);
    if (u_paletteCount > 0) {
        int sel = clamp(
            int(h2.w * float(u_paletteCount)), 0, u_paletteCount - 1
        );
        float idx = u_paletteIndices[sel];
        color = texture(
            u_paletteTexture, vec2((idx + 0.5) / 16.0, 0.5 / 3.0)
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
