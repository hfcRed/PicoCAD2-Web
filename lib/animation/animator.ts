import { traverseNode } from "../scene/scene-graph.ts";
import type {
	AnimationClip,
	AnimationProp,
	Axis,
	SceneNode,
} from "../types/scene.ts";
import { evaluateClip, evaluateTexClipFrame } from "./clip.ts";

const TRANSFORM_PROPS: AnimationProp[] = ["pos", "rot", "scale"];
const AXES: Axis[] = ["x", "y", "z"];
const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };
const TRANSFORM_KEY: Record<string, "position" | "rotation" | "scale"> = {
	pos: "position",
	rot: "rotation",
	scale: "scale",
};

const TEX_AXES: Axis[] = ["x", "y"];
const TEX_UV_OFFSET: Record<string, number> = { x: 0, y: 1 };

/**
 * Collects all clips matching a property+axis across all 4 tracks,
 * sorted by start time.
 *
 * @param node - The scene node whose motions to search.
 * @param prop - The property to match.
 * @param axis - The axis to match.
 * @returns The matching clips sorted by start time.
 */
function collectClips(
	node: SceneNode,
	prop: AnimationProp,
	axis: Axis,
): AnimationClip[] {
	const clips: AnimationClip[] = [];
	for (const track of node.motions.tracks) {
		for (const clip of track) {
			if (clip.prop !== prop) continue;
			if (!clip.axes.includes(axis)) continue;
			clips.push(clip);
		}
	}
	clips.sort((a, b) => a.start - b.start);
	return clips;
}

/**
 * Evaluates a single property+axis combination for a node.
 * Collects all matching clips across all 4 tracks, sorts by start time,
 * and chains their evaluation from the static base value.
 *
 * @param node - The scene node to evaluate.
 * @param prop - The property to evaluate.
 * @param axis - The axis to evaluate.
 * @param time - The current animation time in seconds.
 * @returns The evaluated value.
 */
function evaluateProperty(
	node: SceneNode,
	prop: AnimationProp,
	axis: Axis,
	time: number,
): number {
	let value: number;
	let baseScale = 1;

	if (prop === "visible") {
		value = node.originalVisible ? 1 : 0;
	} else {
		const transformProp = TRANSFORM_KEY[prop];
		const axisIdx = AXIS_INDEX[axis];

		value = node.staticTransform[transformProp][axisIdx];
		if (prop === "scale") {
			baseScale = node.staticTransform.scale[axisIdx];
		}
	}

	const clips = collectClips(node, prop, axis);
	for (const clip of clips) {
		value = evaluateClip(clip, value, time, baseScale);
	}

	return value;
}

/**
 * Applies "tex" clip UV animation to a node's faces.
 * For each UV axis, matching clips are evaluated in start order and their
 * pixel offsets accumulate per face. Face UVs are written as the static UVs
 * plus the accumulated offset divided by the 128px texture size.
 *
 * @param node - The scene node to evaluate.
 * @param time - The current animation time in seconds.
 */
function applyTexAnimation(node: SceneNode, time: number): void {
	if (!node.hasTexClips) return;

	const mesh = node.mesh;
	if (!mesh) return;

	for (const axis of TEX_AXES) {
		const uvOffset = TEX_UV_OFFSET[axis];
		const clips = collectClips(node, "tex", axis);
		if (clips.length === 0) continue;

		const accumulatedFrames = new Map<number, number>();
		for (const clip of clips) {
			const faceIndex = clip.faceIndex;
			if (faceIndex === undefined) continue;

			const face = mesh.faces[faceIndex];
			if (!face) continue;

			const frame =
				(accumulatedFrames.get(faceIndex) ?? 0) +
				evaluateTexClipFrame(clip, time);
			const uvs = face.uvs;
			const staticUvs = face.staticUvs;
			for (let i = 0; i + uvOffset < uvs.length; i += 2) {
				uvs[i + uvOffset] = staticUvs[i + uvOffset] + frame / 128;
			}
			accumulatedFrames.set(faceIndex, frame);
		}
	}

	node.uvsDirty = true;
}

/**
 * Evaluates all animation motions across the scene graph at a given time.
 * Updates node transforms, visibility, and face UVs in-place, marking nodes
 * as dirty.
 *
 * @param root - The root node of the scene graph.
 * @param time - The current animation time in seconds.
 */
export function evaluateMotions(root: SceneNode, time: number): void {
	traverseNode(root, (node) => {
		for (const prop of TRANSFORM_PROPS) {
			for (const axis of AXES) {
				const v = evaluateProperty(node, prop, axis, time);
				const transformProp = TRANSFORM_KEY[prop];
				const axisIdx = AXIS_INDEX[axis];
				node.transform[transformProp][axisIdx] = v;
			}
		}
		node.dirty = true;
	});

	traverseNode(root, (node) => {
		const v = evaluateProperty(node, "visible", "x", time);
		node.visible = v !== 0;
	});

	traverseNode(root, (node) => {
		applyTexAnimation(node, time);
	});
}
