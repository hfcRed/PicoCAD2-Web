#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_speed;
uniform float u_blockSize;
uniform bool u_rgbSplit;
uniform bool u_lineShift;
uniform float u_time;
uniform vec2 u_resolution;
uniform bool u_modelOnly;

out vec4 fragColor;

float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

float blockHash(vec2 uv, float time) {
    float block = floor(uv.y * u_resolution.y / u_blockSize);
    return hash(block * 31.7159 + floor(time * u_speed * 4.0) * 17.1381);
}

void main() {
    vec2 uv = v_texCoord;
    float t = u_time * u_speed;
    float glitchStrength = u_intensity * step(0.5, hash(floor(t * 2.0)));

    if (u_lineShift) {
        float h = blockHash(uv, u_time);
        float shift = (h - 0.5) * 2.0 * glitchStrength * 0.1;
        if (h > 1.0 - u_intensity * 0.3) {
            uv.x += shift;
        }
    }

    vec4 col;

    if (u_rgbSplit) {
        float splitAmount = glitchStrength * 0.02;
        float r = texture(u_texture, uv + vec2(splitAmount, 0.0)).r;
        float g = texture(u_texture, uv).g;
        float b = texture(u_texture, uv - vec2(splitAmount, 0.0)).b;
        float a = texture(u_texture, uv).a;
        col = vec4(r, g, b, a);
    } else {
        col = texture(u_texture, uv);
    }

    float bh = blockHash(uv + 0.1, u_time);
    if (bh > 1.0 - u_intensity * 0.15) {
        float offset = (hash(floor(t * 3.0) + bh) - 0.5) * glitchStrength * 0.2;
        col = texture(u_texture, uv + vec2(offset, 0.0));
    }

    fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
}
