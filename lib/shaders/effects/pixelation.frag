#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_pixelSize;
uniform vec2 u_resolution;
uniform float u_blend;
uniform int u_shape;

out vec4 fragColor;

vec2 hexRound(vec2 h) {
    float q = floor(h.x + 0.5);
    float r = floor(h.y + 0.5);
    float s = floor(-h.x - h.y + 0.5);

    float dq = abs(q - h.x);
    float dr = abs(r - h.y);
    float ds = abs(s + h.x + h.y);

    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;

    return vec2(q, r);
}

bool pointInTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
    vec2 v0 = c - a;
    vec2 v1 = b - a;
    vec2 v2 = p - a;

    float dot00 = dot(v0, v0);
    float dot01 = dot(v0, v1);
    float dot02 = dot(v0, v2);
    float dot11 = dot(v1, v1);
    float dot12 = dot(v1, v2);

    float invDenom = 1.0 / (dot00 * dot11 - dot01 * dot01);
    float u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    float v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    return (u >= 0.0) && (v >= 0.0) && (u + v <= 1.0);
}

bool pointInCross(vec2 px, vec2 center, float size) {
    float arm = size * 0.2;
    float len = size * 0.5;
    vec2 d = abs(px - center);

    return (d.x <= arm && d.y <= len) || (d.y <= arm && d.x <= len);
}

bool pointInStar(vec2 px, vec2 center, float size) {
    float arm = size * 0.18;
    float len = size * 0.5;

    vec2 d = abs(px - center);

    bool cross = (d.x <= arm && d.y <= len) || (d.y <= arm && d.x <= len);
    bool diag = (abs(d.x - d.y) <= arm && d.x + d.y <= len);

    return cross || diag;
}

void main() {
    vec2 uv = v_texCoord;
    vec2 px = uv * u_resolution;
    vec2 sampleUV = uv;

    if (u_shape == 1) {
        // hex
        float size = u_pixelSize;
        float q = (px.x * sqrt(3.0) / 3.0 - px.y / 3.0) / size;
        float r = px.y * 2.0 / 3.0 / size;

        vec2 hexCoord = hexRound(vec2(q, r));
        float x = size * sqrt(3.0) * (hexCoord.x + hexCoord.y / 2.0);
        float y = size * 1.5 * hexCoord.y;

        sampleUV = vec2(x, y) / u_resolution;
    } else if (u_shape == 2) {
        // circle
        vec2 center = (floor(px / u_pixelSize) + 0.5) * u_pixelSize;
        float dist = length(px - center);

        if (dist <= u_pixelSize * 0.5) {
            sampleUV = center / u_resolution;
        }
    } else if (u_shape == 3) {
        // diamond
        vec2 center = (floor(px / u_pixelSize) + 0.5) * u_pixelSize;
        vec2 rel = abs(px - center);

        if (rel.x + rel.y <= u_pixelSize * 0.5) {
            sampleUV = center / u_resolution;
        }
    } else if (u_shape == 4) {
        // triangle
        float size = u_pixelSize;
        vec2 base = floor(px / size) * size;
        vec2 a = base + vec2(size * 0.5, 0.0);
        vec2 b = base + vec2(0.0, size);
        vec2 c = base + vec2(size, size);

        if (pointInTriangle(px, a, b, c)) {
            sampleUV = (a + b + c) / 3.0 / u_resolution;
        }
    } else if (u_shape == 5) {
        // cross
        vec2 center = (floor(px / u_pixelSize) + 0.5) * u_pixelSize;

        if (pointInCross(px, center, u_pixelSize)) {
            sampleUV = center / u_resolution;
        }
    } else if (u_shape == 6) {
        // star
        vec2 center = (floor(px / u_pixelSize) + 0.5) * u_pixelSize;

        if (pointInStar(px, center, u_pixelSize)) {
            sampleUV = center / u_resolution;
        }
    } else {
        // square (shape == 0)
        sampleUV = floor(px / u_pixelSize) * u_pixelSize / u_resolution;
    }

    vec4 col = texture(u_texture, sampleUV);
    vec4 orig = texture(u_texture, uv);
    fragColor = vec4(mix(orig, col, clamp(u_blend, 0.0, 1.0)).rgb, 1.0);
}
