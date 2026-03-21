import { traverseNode } from "../scene/scene-graph.ts";
import type {
	AnimationClip,
	AnimationProp,
	Axis,
	SceneNode,
} from "../types/scene.ts";
import { evaluateClip } from "./clip.ts";

const TRANSFORM_PROPS: AnimationProp[] = ["pos", "rot", "scale"];
const AXES: Axis[] = ["x", "y", "z"];
const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };
const TRANSFORM_KEY: Record<string, "position" | "rotation" | "scale"> = {
	pos: "position",
	rot: "rotation",
	scale: "scale",
};

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
	if (prop === "visible") {
		value = node.originalVisible ? 1 : 0;
	} else {
		const transformProp = TRANSFORM_KEY[prop];
		const axisIdx = AXIS_INDEX[axis];
		value = node.staticTransform[transformProp][axisIdx];
	}

	const clips: AnimationClip[] = [];
	for (const track of node.motions.tracks) {
		for (const clip of track) {
			if (clip.prop !== prop) continue;
			if (!clip.axes.includes(axis)) continue;
			clips.push(clip);
		}
	}

	if (clips.length === 0) return value;

	clips.sort((a, b) => a.start - b.start);

	for (const clip of clips) {
		value = evaluateClip(clip, value, time);
	}

	return value;
}

/**
 * Evaluates all animation motions across the scene graph at a given time.
 * Updates node transforms and visibility in-place, marking nodes as dirty.
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
}
