import type { ProjectionMode } from "./scene";

export interface RawVec3 {
	x: number;
	y: number;
	z: number;
}

export type RawColor = number[] | { r: number; g: number; b: number };

export interface RawTransform {
	pos: RawVec3;
	rot: RawVec3;
	scale: RawVec3;
}

export interface RawFace {
	vertex_ids: number[];
	uvs: number[];
	color: number;
	dbl?: boolean;
	prio?: boolean;
	noshade?: boolean;
	notex?: boolean;
}

export interface RawMesh {
	name: string;
	vertices: number[];
	faces: RawFace[];
}

export interface RawClip {
	prop: "pos" | "rot" | "scale" | "visible";
	axises: ("x" | "y" | "z")[];
	start: number;
	stop: number;
	delta: number;
	times?: number;
	curve?: string;
	pingpong?: boolean;
}

export interface RawMotions {
	tracks: [RawClip[], RawClip[], RawClip[], RawClip[]];
}

export interface RawGraphNode {
	name: string;
	visible: boolean;
	open: boolean;
	locked: boolean;
	transform: RawTransform;
	mesh?: RawMesh;
	children: RawGraphNode[];
	motions?: RawMotions;
	folder?: boolean;
}

export interface RawCameraState {
	pos: RawVec3;
	rot: RawVec3;
	scale: RawVec3;
	target: RawVec3;
	distance_to_target: number;
	theta: number;
	omega: number;
}

export interface RawTexture {
	pixels: string;
	colors: RawColor[];
	shade_pal_1?: number[];
	shade_pal_2?: number[];
	background_color: number;
	transparent_color: number;
}

export interface RawExportSettings {
	fov_type?: ProjectionMode;
}

export interface RawMetadata {
	version: string;
	motion_duration: number;
	shading_mode?: number;
	face_mode?: number;
	camera?: RawCameraState;
	export_settings?: RawExportSettings;
}

export interface RawPicoCAD2File {
	texture: RawTexture;
	graph: RawGraphNode;
	metadata: RawMetadata;
}
