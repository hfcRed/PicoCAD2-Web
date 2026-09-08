import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * vite-plugin-glsl wraps every assembled shader in a JavaScript template
 * literal, and the dev server keeps comments, so a backtick or a `${`
 * anywhere in a shader source terminates the literal and breaks `pnpm dev`
 * while the minified build still passes. This guard fails `pnpm check`
 * in that edge case.
 */
const SHADER_DIR = join(import.meta.dirname, "..", "lib", "shaders");
const SHADER_FILE = /\.(glsl|frag|vert)$/;
const HAZARD = /`|\$\{/;

/**
 * Collects every shader file below a directory.
 *
 * @param dir - The directory to walk.
 * @param out - The list to append to.
 */
function collectShaders(dir: string, out: string[]): void {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			collectShaders(path, out);
		} else if (SHADER_FILE.test(name)) {
			out.push(path);
		}
	}
}

const files: string[] = [];
collectShaders(SHADER_DIR, files);

let failures = 0;
for (const file of files) {
	const lines = readFileSync(file, "utf8").split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		if (!HAZARD.test(lines[i])) continue;
		failures++;
		console.error(
			`${relative(process.cwd(), file)}:${i + 1}: backtick or \${ in a shader source breaks the dev server's template literal`,
		);
	}
}

if (failures > 0) process.exit(1);
console.log(`Checked ${files.length} shader files.`);
