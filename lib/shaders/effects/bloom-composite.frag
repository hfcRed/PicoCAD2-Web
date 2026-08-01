#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform sampler2D u_bloomTexture;
uniform float u_intensity;
uniform bool u_modelOnly;
uniform bool u_bgIsTransparent;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    vec4 bloom = texture(u_bloomTexture, v_texCoord);
    vec3 rgb = col.rgb + bloom.rgb * u_intensity;

    if (u_bgIsTransparent) {
        if (u_modelOnly) {
            fragColor = vec4(min(rgb, vec3(col.a)), col.a);
        } else {
            float outA = clamp(col.a + bloom.a * u_intensity, 0.0, 1.0);
            fragColor = vec4(min(rgb, vec3(outA)), outA);
        }
        return;
    }

    fragColor = vec4(rgb, u_modelOnly ? col.a : 1.0);
}
