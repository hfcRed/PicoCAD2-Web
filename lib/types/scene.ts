import type { mat4 } from "gl-matrix";

export type Color3 = [number, number, number];

export type RenderMode = "texture" | "color" | "none";

export type AnimationProp = "pos" | "rot" | "scale" | "visible";

export type Axis = "x" | "y" | "z";

export interface Transform {
	position: Float32Array;
	rotation: Float32Array;
	scale: Float32Array;
}

export interface Face {
	vertexIndices: number[];
	uvs: Float32Array;
	color: number;
	doubleSided: boolean;
	priority: boolean;
	noShading: boolean;
	noTexture: boolean;
}

export interface Mesh {
	vertices: Float32Array;
	faces: Face[];
}

export interface AnimationClip {
	prop: AnimationProp;
	axes: Axis[];
	start: number;
	stop: number;
	delta: number;
	times?: number | undefined;
	curve: string;
	pingpong: boolean;
}

export interface MotionData {
	tracks: [AnimationClip[], AnimationClip[], AnimationClip[], AnimationClip[]];
}

export interface SceneNode {
	name: string;
	visible: boolean;
	children: SceneNode[];
	transform: Transform;
	staticTransform: Transform;
	originalVisible: boolean;
	mesh: Mesh | null;
	motions: MotionData;
	dirty: boolean;
	localMatrix: mat4;
}

export interface TextureData {
	pixels: Uint8Array;
	colors: Float32Array;
	shadePalette1: Uint8Array;
	shadePalette2: Uint8Array;
	backgroundColor: number;
	transparentColor: number;
}

export type ProjectionMode = "perspective" | "orthographic" | "fisheye";

export interface PicoCAD2Model {
	root: SceneNode;
	texture: TextureData;
	motionDuration: number;
	shadingEnabled: boolean;
	camera: CameraState | null;
	projectionMode: ProjectionMode;
}

export interface CameraState {
	target: Float32Array;
	distanceToTarget: number;
	theta: number;
	omega: number;
}
