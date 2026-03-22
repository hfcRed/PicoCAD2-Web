import * as twgl from "twgl.js";
import modelFrag from "../shaders/model.frag";
import modelVert from "../shaders/model.vert";
import outlineFrag from "../shaders/outline.frag";
import outlineVert from "../shaders/outline.vert";

export interface ShaderPrograms {
	model: twgl.ProgramInfo;
	outline: twgl.ProgramInfo;
}

/**
 * Creates all shader programs for the renderer.
 *
 * @param gl - The WebGL 2 rendering context.
 * @returns The shader programs.
 */
export function createPrograms(gl: WebGL2RenderingContext): ShaderPrograms {
	return {
		model: twgl.createProgramInfo(gl, [modelVert, modelFrag]),
		outline: twgl.createProgramInfo(gl, [outlineVert, outlineFrag]),
	};
}
