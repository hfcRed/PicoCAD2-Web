import { traverseNode } from "../scene/scene-graph.ts";
import type { AnimationClip, SceneNode } from "../types/scene.ts";
import { evaluateClip } from "./clip.ts";

const PROPS = ["pos", "rot", "scale"] as const;
const AXES = ["x", "y", "z"] as const;
const AXIS_MAP: Record<string, number> = { x: 0, y: 1, z: 2 };
const PROP_MAP: Record<string, "position" | "rotation" | "scale"> = {
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
	prop: (typeof PROPS)[number] | "visible",
	axis: (typeof AXES)[number],
	time: number,
): number {
	let value: number;
	if (prop === "visible") {
		value = node.originalVisible ? 1 : 0;
	} else {
		const transformProp = PROP_MAP[prop];
		const axisIdx = AXIS_MAP[axis];
		value = node.staticTransform[transformProp][axisIdx];
	}

	const clips: AnimationClip[] = [];
	for (const track of node.motions.tracks) {
		for (const clip of track) {
			if (clip.prop !== prop) continue;
			if (!clip.axes.includes(axis as "x" | "y" | "z")) continue;
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
		for (const prop of PROPS) {
			for (const axis of AXES) {
				const v = evaluateProperty(node, prop, axis, time);
				const transformProp = PROP_MAP[prop];
				const axisIdx = AXIS_MAP[axis];
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
