import type { mat4 } from "gl-matrix";
import type { Color3, SceneNode } from "../../types/scene.ts";
import type { ModelResources, RenderStats } from "../renderer.ts";
import type { CyclePhase } from "./cycle.ts";
import type { TransparencyMode } from "./material-style.ts";
import type { MeshDeformEffect } from "./mesh-deform-effect.ts";
import type { VertexGlitchEffect } from "./vertex-glitch-effect.ts";

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
	cameraPos: Color3;
	cameraFwd: Color3;
	cameraRight: Color3;
	cameraUp: Color3;
	cameraAzimuth: number;
	cameraElevation: number;
	palette: Float32Array;
	paletteBlend: number;
	meshDeform: MeshDeformEffect | null;
	deformPhase: CyclePhase;
	shatterActive: boolean;
	vertexGlitch: VertexGlitchEffect | null;
	glitchPhase: CyclePhase;
	glitchActive: boolean;
	nodeBits: ReadonlyMap<SceneNode, number>;
	transparency: TransparencyMode;
	smoothFades: boolean;
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
	readonly writesIndex?: boolean;

	enabled: boolean;
	init(gl: WebGL2RenderingContext): void;
	render(ctx: EffectContext, vpMatrix: mat4, resources: ModelResources): void;
	dispose(): void;
}
