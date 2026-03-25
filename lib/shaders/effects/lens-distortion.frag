#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_strength;
uniform float u_zoom;
uniform bool u_modelOnly;

out vec4 fragColor;

void main() {
    vec2 uv = v_texCoord * 2.0 - 1.0;
    float r = length(uv);
    float theta = atan(uv.y, uv.x);

    float rn = r + u_strength * pow(r, 3.0);
    rn /= u_zoom;

    vec2 distorted = rn * vec2(cos(theta), sin(theta));
    vec2 sampleUV = (distorted + 1.0) * 0.5;

    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    } else {
        vec4 col = texture(u_texture, sampleUV);
        fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
    }
}
