/**
 * Shader minifier for the library build and the visual suite.
 *
 * vite-plugin-glsl's built-in minifier strips only the first block comment
 * of each assembled shader and squashes the rest onto the code, so the
 * chunks' function documentation shipped in the bundle. This one removes
 * every comment, keeps preprocessor directives on their own lines, and joins
 * everything else with the whitespace around punctuation dropped.
 */

const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const PUNCTUATION = /\s*([{}()[\],;=<>!&|*/?:%^~])\s*/g;

/**
 * Removes the whitespace around the sign operators, keeping one space where
 * two equal signs would otherwise merge into an increment or decrement.
 *
 * @param code - A whitespace-collapsed code segment.
 * @returns The segment with the signs tightened.
 */
function tightenSigns(code: string): string {
	return code
		.replace(/([^-\s])\s+-/g, "$1-")
		.replace(/-\s+([^-\s])/g, "-$1")
		.replace(/([^+\s])\s+\+/g, "$1+")
		.replace(/\+\s+([^+\s])/g, "+$1");
}

/**
 * Joins code lines into one segment with the least whitespace the grammar
 * allows. Lines join with a space first, so tokens that need one (`else
 * return`) keep it, and the punctuation pass removes the rest.
 *
 * @param lines - Trimmed, comment-free code lines.
 * @returns The minified segment.
 */
function minifyCode(lines: string[]): string {
	const joined = lines.join(" ").replace(/\s+/g, " ");
	return tightenSigns(joined.replace(PUNCTUATION, "$1"));
}

/**
 * Minifies an assembled GLSL shader.
 *
 * @param shader - The shader source with its includes resolved.
 * @returns The source without comments or removable whitespace.
 */
export function minifyGlsl(shader: string): string {
	const parts: string[] = [];
	let code: string[] = [];

	function flush(): void {
		if (code.length === 0) return;
		parts.push(minifyCode(code));
		code = [];
	}

	for (const raw of shader.replace(COMMENT, "").split(/\r?\n/)) {
		const line = raw.trim();
		if (line.length === 0) continue;
		if (line.startsWith("#")) {
			flush();
			parts.push(line.replace(/\s+/g, " "));
			continue;
		}
		code.push(line);
	}
	flush();

	return parts.join("\n");
}
