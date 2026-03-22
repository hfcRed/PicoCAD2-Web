#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;

out vec4 fragColor;

vec3 rgb2hsv(vec3 c) {
    float cmax = max(c.r, max(c.g, c.b));
    float cmin = min(c.r, min(c.g, c.b));
    float delta = cmax - cmin;
    float h = 0.0;

    if (delta > 0.0) {
        if (cmax == c.r) h = mod((c.g - c.b) / delta, 6.0);
        else if (cmax == c.g) h = (c.b - c.r) / delta + 2.0;
        else h = (c.r - c.g) / delta + 4.0;
        h /= 6.0;
    }

    float s = cmax == 0.0 ? 0.0 : delta / cmax;
    return vec3(h, s, cmax);
}

vec3 hsv2rgb(vec3 c) {
    float h = c.x * 6.0;
    float s = c.y;
    float v = c.z;
    float f = fract(h);
    float p = v * (1.0 - s);
    float q = v * (1.0 - f * s);
    float t = v * (1.0 - (1.0 - f) * s);

    if (h < 1.0) return vec3(v, t, p);
    if (h < 2.0) return vec3(q, v, p);
    if (h < 3.0) return vec3(p, v, t);
    if (h < 4.0) return vec3(p, q, v);
    if (h < 5.0) return vec3(t, p, v);

    return vec3(v, p, q);
}

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    col.rgb = (col.rgb - 0.5) * u_contrast + 0.5;
    col.rgb *= u_brightness;

    vec3 hsv = rgb2hsv(col.rgb);
    hsv.y *= u_saturation;
    hsv.x = mod(hsv.x + u_hue, 1.0);

    col.rgb = hsv2rgb(hsv);
    fragColor = col;
}
