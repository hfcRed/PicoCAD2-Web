import furFrag from "../shaders/fur.frag";
import furVert from "../shaders/fur.vert";
import modelFrag from "../shaders/model.frag";
import modelVert from "../shaders/model.vert";
import outlineFrag from "../shaders/outline.frag";
import outlineVert from "../shaders/outline.vert";
import { MODEL_ATTRIB_LOCATIONS } from "./buffers.ts";
import {
	compilerFor,
	type ManagedProgram,
	type ProgramCompiler,
	ProgramVariants,
} from "./program-cache.ts";

/**
 * The model shader's features, one bit each. A variant of the model, fur
 * or wireframe program is compiled per combination a frame asks for, with
 * the matching preprocessor symbols defined, so a program only carries
 * the code of the effects in use and the plain model compiles fast.
 */
export const MODEL_FEATURE = Object.freeze({
	deform: 1 << 0,
	vertexGlitch: 1 << 1,
	shatter: 1 << 2,
	flash: 1 << 3,
	dissolve: 1 << 4,
	paletteBlend: 1 << 5,
	interior: 1 << 6,
	rimLight: 1 << 7,
	gradientLight: 1 << 8,
	specular: 1 << 9,
	glitter: 1 << 10,
	emission: 1 << 11,
	projection: 1 << 12,
	display: 1 << 13,
	indexOut: 1 << 14,
	depthOnly: 1 << 15,
});

/** The preprocessor symbol of each feature bit, in bit order. */
export const MODEL_FEATURE_NAMES: readonly string[] = [
	"FX_DEFORM",
	"FX_VGLITCH",
	"FX_SHATTER",
	"FX_FLASH",
	"FX_DISSOLVE",
	"FX_PALETTE_BLEND",
	"FX_INTERIOR",
	"FX_RIM",
	"FX_GRADLIGHT",
	"FX_SPECULAR",
	"FX_GLITTER",
	"FX_EMISSION",
	"FX_PROJECTION",
	"FX_DISPLAY",
	"FX_INDEX_OUT",
	"FX_DEPTH_ONLY",
];

/** The features the fur program shares with the model program. */
export const FUR_FEATURES =
	MODEL_FEATURE.deform |
	MODEL_FEATURE.vertexGlitch |
	MODEL_FEATURE.dissolve |
	MODEL_FEATURE.paletteBlend |
	MODEL_FEATURE.indexOut |
	MODEL_FEATURE.depthOnly;

/** The features the wireframe program shares with the model program. */
export const WIREFRAME_FEATURES =
	MODEL_FEATURE.deform | MODEL_FEATURE.vertexGlitch;

/**
 * The features that decide which fragments a depth-only pass keeps. The
 * display is among them because a display's coarser texel lookup changes
 * the index the dissolve mask tests.
 */
export const DEPTH_FEATURES =
	MODEL_FEATURE.deform |
	MODEL_FEATURE.vertexGlitch |
	MODEL_FEATURE.shatter |
	MODEL_FEATURE.dissolve |
	MODEL_FEATURE.display;

/**
 * The renderer's shader programs. The model and fur programs come in
 * variants keyed by {@link MODEL_FEATURE} bits, compiled on first use
 * through the context's compiler, in the background where the browser
 * allows. The plain scene variants and the outline compile at startup,
 * blocking, so the first frame always has a program to draw with.
 */
export class ShaderPrograms {
	readonly compiler: ProgramCompiler;
	readonly model: ProgramVariants;
	readonly fur: ProgramVariants;
	readonly outline: ManagedProgram;

	/**
	 * Creates the programs for a context.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	constructor(gl: WebGL2RenderingContext) {
		this.compiler = compilerFor(gl);
		this.model = new ProgramVariants(
			this.compiler,
			modelVert,
			modelFrag,
			MODEL_FEATURE_NAMES,
			MODEL_ATTRIB_LOCATIONS,
		);
		this.fur = new ProgramVariants(
			this.compiler,
			furVert,
			furFrag,
			MODEL_FEATURE_NAMES,
			MODEL_ATTRIB_LOCATIONS,
		);
		this.outline = this.compiler.compile(outlineVert, outlineFrag, [], true);
		this.model.get(MODEL_FEATURE.indexOut, true);
		this.model.get(0, true);
	}

	/**
	 * Frees every program.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	dispose(gl: WebGL2RenderingContext): void {
		this.model.dispose();
		this.fur.dispose();
		this.compiler.forget(this.outline);
		this.outline.dispose(gl);
	}
}
