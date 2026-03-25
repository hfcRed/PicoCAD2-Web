#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform sampler2D u_bloomTexture;
uniform float u_intensity;
uniform bool u_modelOnly;

out vec4 fragColor;

void main() {
    vec4 col = texture(u_texture, v_texCoord);
    vec4 bloom = texture(u_bloomTexture, v_texCoord);
    col.rgb += bloom.rgb * u_intensity;
    fragColor = vec4(col.rgb, u_modelOnly ? col.a : 1.0);
}
