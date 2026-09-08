import * as twgl from "twgl.js";

export type ShaderCompileMode = "async" | "sync";

interface ParallelCompileExt {
	COMPLETION_STATUS_KHR: number;
}

/**
 * A shader program that may still be linking. `info` is null until the
 * link has finished and holds the program's twgl setters afterwards.
 * `failed` marks a program whose compile or link failed, which is logged
 * once and never drawn.
 */
export class ManagedProgram {
	readonly program: WebGLProgram;
	info: twgl.ProgramInfo | null = null;
	failed = false;
	private readonly shaders: WebGLShader[];

	constructor(program: WebGLProgram, shaders: WebGLShader[]) {
		this.program = program;
		this.shaders = shaders;
	}

	/** Whether the program linked and can be drawn with. */
	get ready(): boolean {
		return this.info !== null;
	}

	/**
	 * Reads the link result, blocking until the link has finished when the
	 * driver has not finished it yet.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	finalize(gl: WebGL2RenderingContext): void {
		if (this.info || this.failed) return;

		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			this.failed = true;
			const logs = this.shaders
				.map((shader) => gl.getShaderInfoLog(shader))
				.filter((log) => log);
			console.error(
				`Shader program failed to link: ${gl.getProgramInfoLog(this.program)}\n${logs.join("\n")}`,
			);
		} else {
			this.info = twgl.createProgramInfoFromProgram(gl, this.program);
		}

		for (const shader of this.shaders) gl.deleteShader(shader);
		this.shaders.length = 0;
	}

	/**
	 * Frees the program.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 */
	dispose(gl: WebGL2RenderingContext): void {
		for (const shader of this.shaders) gl.deleteShader(shader);
		this.shaders.length = 0;
		gl.deleteProgram(this.program);
		this.info = null;
		this.failed = true;
	}
}

/**
 * Compiles shader programs for one context without blocking the main
 * thread. Where the browser offers parallel shader compilation, a program
 * links in the background and {@link poll} picks up the result on a
 * later frame, so a viewer keeps drawing with the programs it already
 * has. Without it, every compile blocks like a plain WebGL link does.
 *
 * Preprocessor defines turn one shader source into variants, so a program
 * only carries the features a frame needs and the compile stays small.
 */
export class ProgramCompiler {
	readonly gl: WebGL2RenderingContext;
	mode: ShaderCompileMode;
	private readonly parallel: ParallelCompileExt | null;
	private readonly pending: ManagedProgram[] = [];

	/**
	 * Creates a compiler for a context.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @param mode - Whether programs link in the background where possible.
	 */
	constructor(gl: WebGL2RenderingContext, mode: ShaderCompileMode = "async") {
		this.gl = gl;
		this.mode = mode;
		this.parallel = gl.getExtension(
			"KHR_parallel_shader_compile",
		) as ParallelCompileExt | null;
	}

	/** Whether programs can link in the background on this context. */
	get canCompileAsync(): boolean {
		return this.parallel !== null;
	}

	/** How many programs are still linking. */
	get pendingCount(): number {
		return this.pending.length;
	}

	/**
	 * Starts compiling a program. In async mode on a context with parallel
	 * compilation the returned program is not ready until a later
	 * {@link poll} finds the link finished. Otherwise it is ready (or
	 * failed) on return.
	 *
	 * @param vertexSource - The vertex shader source.
	 * @param fragmentSource - The fragment shader source.
	 * @param defines - Preprocessor symbols defined in both stages.
	 * @param sync - Force a blocking link, for programs a frame cannot do without.
	 * @param attribLocations - Attribute locations to bind before linking,
	 *   so programs sharing a layout can share vertex array objects.
	 * @returns The managed program.
	 */
	compile(
		vertexSource: string,
		fragmentSource: string,
		defines: readonly string[] = [],
		sync = false,
		attribLocations?: Readonly<Record<string, number>>,
	): ManagedProgram {
		const gl = this.gl;
		const program = gl.createProgram();
		if (!program) throw new Error("Failed to create a shader program");

		const shaders: WebGLShader[] = [];
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertexSource],
			[gl.FRAGMENT_SHADER, fragmentSource],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Failed to create a shader");
			gl.shaderSource(shader, withDefines(source, defines));
			gl.compileShader(shader);
			gl.attachShader(program, shader);
			shaders.push(shader);
		}
		if (attribLocations) {
			for (const name of Object.keys(attribLocations)) {
				gl.bindAttribLocation(program, attribLocations[name], name);
			}
		}
		gl.linkProgram(program);

		const managed = new ManagedProgram(program, shaders);
		if (sync || this.mode === "sync" || !this.parallel) {
			managed.finalize(gl);
		} else {
			this.pending.push(managed);
		}
		return managed;
	}

	/**
	 * Picks up finished links. Call once per frame; it never blocks.
	 */
	poll(): void {
		if (this.pending.length === 0 || !this.parallel) return;
		const gl = this.gl;
		const status = this.parallel.COMPLETION_STATUS_KHR;
		for (let i = this.pending.length - 1; i >= 0; i--) {
			const managed = this.pending[i];
			if (managed.failed || gl.getProgramParameter(managed.program, status)) {
				managed.finalize(gl);
				this.pending.splice(i, 1);
			}
		}
	}

	/**
	 * Finishes every pending link, blocking until the driver is done.
	 */
	flush(): void {
		for (const managed of this.pending.splice(0)) managed.finalize(this.gl);
	}

	/**
	 * Resolves once every pending program has linked, polling once per
	 * animation frame (or timer, when frames are not delivered).
	 */
	whenReady(): Promise<void> {
		return new Promise((resolve) => {
			const check = (): void => {
				this.poll();
				if (this.pending.length === 0) {
					resolve();
					return;
				}
				setTimeout(check, 16);
			};
			check();
		});
	}

	/**
	 * Forgets a program that was disposed elsewhere.
	 *
	 * @param managed - The disposed program.
	 */
	forget(managed: ManagedProgram): void {
		const idx = this.pending.indexOf(managed);
		if (idx >= 0) this.pending.splice(idx, 1);
	}
}

const compilers = new WeakMap<WebGL2RenderingContext, ProgramCompiler>();

/**
 * The compiler of a context, created on first use. Effects reach their
 * context's compiler through the `gl` they are initialized with.
 *
 * @param gl - The WebGL 2 rendering context.
 * @returns The context's compiler.
 */
export function compilerFor(gl: WebGL2RenderingContext): ProgramCompiler {
	let compiler = compilers.get(gl);
	if (!compiler) {
		compiler = new ProgramCompiler(gl);
		compilers.set(gl, compiler);
	}
	return compiler;
}

/**
 * Inserts preprocessor defines after the version directive, which GLSL ES
 * requires to be the first line.
 *
 * @param source - The shader source.
 * @param defines - The symbols to define.
 * @returns The source with the defines.
 */
function withDefines(source: string, defines: readonly string[]): string {
	if (defines.length === 0) return source;
	const block = defines.map((name) => `#define ${name} 1\n`).join("");
	const newline = source.indexOf("\n");
	if (newline < 0 || !source.startsWith("#version")) return block + source;
	return `${source.slice(0, newline + 1)}${block}${source.slice(newline + 1)}`;
}

/**
 * The variants of one shader pair, keyed by a bitmask of feature names.
 * Each variant is compiled once, on first request, with the features'
 * names defined.
 */
export class ProgramVariants {
	private readonly compiler: ProgramCompiler;
	private readonly vertexSource: string;
	private readonly fragmentSource: string;
	private readonly features: readonly string[];
	private readonly attribLocations: Readonly<Record<string, number>> | null;
	private readonly variants = new Map<number, ManagedProgram>();

	/**
	 * Creates the variant set.
	 *
	 * @param compiler - The context's compiler.
	 * @param vertexSource - The vertex shader source.
	 * @param fragmentSource - The fragment shader source.
	 * @param features - The feature names, bit i of a key defines features[i].
	 * @param attribLocations - Attribute locations every variant binds.
	 */
	constructor(
		compiler: ProgramCompiler,
		vertexSource: string,
		fragmentSource: string,
		features: readonly string[],
		attribLocations?: Readonly<Record<string, number>>,
	) {
		this.compiler = compiler;
		this.vertexSource = vertexSource;
		this.fragmentSource = fragmentSource;
		this.features = features;
		this.attribLocations = attribLocations ?? null;
	}

	/**
	 * The variant for a key, compiling it on first request.
	 *
	 * @param key - The feature bitmask.
	 * @param sync - Whether a first compile must block until ready.
	 * @returns The variant, ready or still linking.
	 */
	get(key: number, sync = false): ManagedProgram {
		let variant = this.variants.get(key);
		if (variant) return variant;

		const defines: string[] = [];
		for (let i = 0; i < this.features.length; i++) {
			if (key & (1 << i)) defines.push(this.features[i]);
		}
		variant = this.compiler.compile(
			this.vertexSource,
			this.fragmentSource,
			defines,
			sync,
			this.attribLocations ?? undefined,
		);
		this.variants.set(key, variant);
		return variant;
	}

	/**
	 * The variant for a key when it is ready, without compiling anything.
	 *
	 * @param key - The feature bitmask.
	 * @returns The ready program info, or null.
	 */
	ready(key: number): twgl.ProgramInfo | null {
		return this.variants.get(key)?.info ?? null;
	}

	/**
	 * Frees every variant.
	 */
	dispose(): void {
		for (const variant of this.variants.values()) {
			this.compiler.forget(variant);
			variant.dispose(this.compiler.gl);
		}
		this.variants.clear();
	}
}
