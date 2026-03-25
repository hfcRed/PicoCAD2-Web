#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_threshold;
uniform vec3 u_lineColor;
uniform vec3 u_backgroundColor;
uniform float u_blend;
uniform vec2 u_resolution;
uniform bool u_modelOnly;

out vec4 fragColor;

float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 texel = 1.0 / u_resolution;

    float tl = luminance(texture(u_texture, v_texCoord + vec2(-texel.x,  texel.y)).rgb);
    float t  = luminance(texture(u_texture, v_texCoord + vec2(0.0,       texel.y)).rgb);
    float tr = luminance(texture(u_texture, v_texCoord + vec2( texel.x,  texel.y)).rgb);
    float l  = luminance(texture(u_texture, v_texCoord + vec2(-texel.x,  0.0)).rgb);
    float r  = luminance(texture(u_texture, v_texCoord + vec2( texel.x,  0.0)).rgb);
    float bl = luminance(texture(u_texture, v_texCoord + vec2(-texel.x, -texel.y)).rgb);
    float b  = luminance(texture(u_texture, v_texCoord + vec2(0.0,      -texel.y)).rgb);
    float br = luminance(texture(u_texture, v_texCoord + vec2( texel.x, -texel.y)).rgb);

    // Sobel operator
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float edge = sqrt(gx * gx + gy * gy);

    float edgeMask = step(u_threshold, edge);
    vec3 edgeResult = mix(u_backgroundColor, u_lineColor, edgeMask);

    vec4 col = texture(u_texture, v_texCoord);
    vec3 result = mix(col.rgb, edgeResult, u_blend);

    fragColor = vec4(result, u_modelOnly ? col.a : 1.0);
}
