import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import glsl from "vite-plugin-glsl";

export default defineConfig({
	plugins: [dts({ tsconfigPath: "tsconfig.lib.json" }), glsl()],
	build: {
		copyPublicDir: false,
		assetsInlineLimit: 100000,
		lib: {
			entry: "./lib/main.ts",
			formats: ["es"],
			fileName: "main",
		},
	},
});
