import type { mat4 } from "gl-matrix";
import type { ModelResources } from "../renderer.ts";

export interface EffectContext {
	gl: WebGL2RenderingContext;
	width: number;
	height: number;
	time: number;
}

export interface PostProcessEffect {
	readonly id: string;
	readonly initialized: boolean;
	enabled: boolean;
	init(gl: WebGL2RenderingContext): void;
	apply(ctx: EffectContext, inputTexture: WebGLTexture): void;
	dispose(): void;
}

export interface SceneEffect {
	readonly id: string;
	readonly initialized: boolean;
	enabled: boolean;
	init(gl: WebGL2RenderingContext): void;
	render(ctx: EffectContext, vpMatrix: mat4, resources: ModelResources): void;
	dispose(): void;
}
