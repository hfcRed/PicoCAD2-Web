#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform vec2 u_resolution;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

out vec4 fragColor;

void main() {
    vec2 uv = v_texCoord;

    uv = uv * 2.0 - 1.0;
    uv.x *= 1.0 + u_curvature * pow(uv.y, 2.0);
    uv.y *= 1.0 + u_curvature * pow(uv.x, 2.0);
    uv = (uv + 1.0) * 0.5;

    vec4 col = texture(u_texture, uv);
    float scan = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
    float m = mix(1.0, scan, u_scanlineIntensity);

    if (u_bgIsTransparent) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            fragColor = vec4(0.0);
            return;
        }
        
        if (u_modelOnly) {
            fragColor = vec4(col.rgb * m, col.a);
        } else {
            fragColor = vec4(col.rgb * m, (1.0 - m) + col.a * m);
        }
        return;
    }

    fragColor = vec4(col.rgb * m, u_modelOnly ? col.a : 1.0);
}
