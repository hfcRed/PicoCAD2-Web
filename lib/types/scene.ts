import type { mat4 } from "gl-matrix";

export type Color3 = [number, number, number];

export type AnimationProp = "pos" | "rot" | "scale" | "visible" | "tex";

export type Axis = "x" | "y" | "z";

export interface Transform {
	position: Float32Array;
	rotation: Float32Array;
	scale: Float32Array;
}

export interface Face {
	vertexIndices: number[];
	uvs: Float32Array;
	staticUvs: Float32Array;
	color: number;
	doubleSided: boolean;
	priority: boolean;
	noShading: boolean;
	noTexture: boolean;
	interior?: boolean;
}

export interface MeshBounds {
	min: [number, number, number];
	max: [number, number, number];
}

export interface Mesh {
	vertices: Float32Array;
	faces: Face[];
	bounds?: MeshBounds;
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
	faceIndex?: number | undefined;
	frames?: number | undefined;
	step?: number | undefined;
	returnUv?: boolean | undefined;
}

export interface MotionData {
	tracks: [AnimationClip[], AnimationClip[], AnimationClip[], AnimationClip[]];
}

export type AxisClips = [AnimationClip[], AnimationClip[], AnimationClip[]];

export interface ClipLists {
	pos: AxisClips;
	rot: AxisClips;
	scale: AxisClips;
	visible: AnimationClip[];
	tex: [AnimationClip[], AnimationClip[]];
}

export interface SceneNode {
	name: string;
	visible: boolean;
	renderVisible: boolean;
	ghost: boolean;
	children: SceneNode[];
	transform: Transform;
	staticTransform: Transform;
	originalVisible: boolean;
	mesh: Mesh | null;
	motions: MotionData;
	clipLists: ClipLists;
	hasClips: boolean;
	hasTexClips: boolean;
	uvsDirty: boolean;
	dirty: boolean;
	localMatrix: mat4;
	worldMatrix: mat4;
}

export interface TextureData {
	pixels: Uint8Array;
	colors: Float32Array;
	sourceColors: Float64Array;
	shadePalette1: Uint8Array;
	shadePalette2: Uint8Array;
	backgroundColor: number;
	transparentColor: number;
}

export type ProjectionMode = "perspective" | "orthographic" | "fisheye";

export type CameraMode = "spin" | "sway" | "pingpong" | "fixed";

export interface ExportSettings {
	cameraMode: CameraMode;
	cameraModeDirection: "left" | "right";
	cameraModeSpeed: number;
	animate: boolean;
	animateLoops: number;
	outlineSize: number;
	outlineColor: Color3;
	scanlines: boolean;
	scanlineColor: Color3;
	watermark: string;
	watermarkColor: Color3;
	watermark2: string;
	watermark2Color: Color3;
}

export interface PicoCAD2Model {
	root: SceneNode;
	texture: TextureData;
	motionDuration: number;
	shadingMode: number;
	renderMode: number;
	camera: CameraState;
	bookmark: CameraBookmark;
	projectionMode: ProjectionMode;
	exportSettings: ExportSettings;
}

export interface CameraState {
	target: Float32Array;
	distanceToTarget: number;
	theta: number;
	omega: number;
}

export interface CameraBookmark {
	target: Float32Array;
	distanceToTarget: number;
	theta: number;
	omega: number;
}
