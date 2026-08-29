import type { mat4 } from "gl-matrix";
import type { Color3 } from "../../types/scene.ts";
import type { ModelResources, RenderStats } from "../renderer.ts";
import type { MeshDeformEffect } from "./mesh-deform-effect.ts";

export interface EffectContext {
	gl: WebGL2RenderingContext;
	width: number;
	height: number;
	time: number;
	stats: RenderStats;
	depthTexture: WebGLTexture | null;
	indexTexture: WebGLTexture | null;
	paletteTexture: WebGLTexture | null;
	projectionMatrix: mat4;
	invProjectionMatrix: mat4;
	backgroundColor: Color3;
	isOrthographic: boolean;
	bgIsTransparent: boolean;
	cameraFwd: Color3;
	cameraRight: Color3;
	cameraUp: Color3;
	meshDeform: MeshDeformEffect | null;
	shatterActive: boolean;
}

export interface PostProcessEffect {
	readonly id: string;
	readonly initialized: boolean;
	readonly warpsIndex?: boolean;
	enabled: boolean;
	modelOnly: boolean;
	maskedColors: number[];
	init(gl: WebGL2RenderingContext): void;
	apply(ctx: EffectContext, inputTexture: WebGLTexture): void;
	dispose(): void;
}

export interface SceneEffect {
	readonly id: string;
	readonly initialized: boolean;
	enabled: boolean;
	modelOnly: boolean;
	init(gl: WebGL2RenderingContext): void;
	render(ctx: EffectContext, vpMatrix: mat4, resources: ModelResources): void;
	dispose(): void;
}
