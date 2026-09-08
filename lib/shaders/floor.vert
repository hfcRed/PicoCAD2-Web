#version 300 es
precision highp float;

/**
 * The floor plate, an attribute-less quad on the plane under the model.
 * Two triangles come from the vertex id and uniforms place and size them,
 * so the plate needs no buffers.
 */

uniform mat4 u_vp;
uniform vec3 u_floorCenter;
uniform float u_floorHalf;

out vec3 v_worldPos;

const vec2 QUAD[6] = vec2[6](
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
    vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0)
);

void main() {
    vec2 corner = QUAD[gl_VertexID] * u_floorHalf;
    vec3 worldPos = u_floorCenter + vec3(corner.x, 0.0, corner.y);
    gl_Position = u_vp * vec4(worldPos, 1.0);
    v_worldPos = worldPos;
}
