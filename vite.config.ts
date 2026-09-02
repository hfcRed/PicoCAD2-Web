import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import glsl from "vite-plugin-glsl";

export default defineConfig(({ command, mode }) => ({
	plugins: [
		dts({ tsconfigPath: "tsconfig.lib.json" }),
		glsl({ minify: command === "build" || mode === "test" }),
	],
	build: {
		copyPublicDir: false,
		assetsInlineLimit: 100000,
		lib: {
			entry: "./lib/main.ts",
			formats: ["es"],
			fileName: "main",
		},
	},
}));
