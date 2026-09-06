import type {
	AnimationClip,
	AnimationProp,
	Axis,
	AxisClips,
	ClipLists,
	MotionData,
	SceneNode,
} from "../types/scene.ts";
import { evaluateClip, evaluateTexClipFrame } from "./clip.ts";

const TRANSFORM_PROPS = ["pos", "rot", "scale"] as const;
const AXES: Axis[] = ["x", "y", "z"];
const TRANSFORM_KEY: Record<
	(typeof TRANSFORM_PROPS)[number],
	"position" | "rotation" | "scale"
> = {
	pos: "position",
	rot: "rotation",
	scale: "scale",
};

const TEX_AXES: Axis[] = ["x", "y"];

/**
 * Collects all clips matching a property+axis across all 4 tracks,
 * sorted by start time.
 *
 * @param motions - The node's motion data.
 * @param prop - The property to match.
 * @param axis - The axis to match.
 * @returns The matching clips sorted by start time.
 */
function collectClips(
	motions: MotionData,
	prop: AnimationProp,
	axis: Axis,
): AnimationClip[] {
	const clips: AnimationClip[] = [];
	for (const track of motions.tracks) {
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
 * Sorts a node's clips by property and axis once, so every frame walks
 * the lists instead of filtering the tracks nine times per node.
 *
 * @param motions - The node's motion data.
 * @returns The clip lists.
 */
export function buildClipLists(motions: MotionData): ClipLists {
	const axisClips = (prop: AnimationProp): AxisClips => [
		collectClips(motions, prop, "x"),
		collectClips(motions, prop, "y"),
		collectClips(motions, prop, "z"),
	];
	return {
		pos: axisClips("pos"),
		rot: axisClips("rot"),
		scale: axisClips("scale"),
		visible: collectClips(motions, "visible", "x"),
		tex: [collectClips(motions, "tex", "x"), collectClips(motions, "tex", "y")],
	};
}

/**
 * Evaluates one transform property axis of a node by chaining its clips
 * from the static base value.
 *
 * @param node - The scene node to evaluate.
 * @param prop - The property to evaluate.
 * @param axisIdx - The axis index.
 * @param clips - The property axis' clips in start order.
 * @param time - The current animation time in seconds.
 * @returns The evaluated value.
 */
function evaluateTransformProperty(
	node: SceneNode,
	prop: (typeof TRANSFORM_PROPS)[number],
	axisIdx: number,
	clips: AnimationClip[],
	time: number,
): number {
	let value = node.staticTransform[TRANSFORM_KEY[prop]][axisIdx];
	const baseScale = prop === "scale" ? value : 1;
	for (let i = 0; i < clips.length; i++) {
		value = evaluateClip(clips[i], value, time, baseScale);
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

	for (let axis = 0; axis < TEX_AXES.length; axis++) {
		const uvOffset = axis;
		const clips = node.clipLists.tex[axis];
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
 * Evaluates a node's motions and its descendants'. Nodes without clips
 * keep their transforms, so their matrices stay cached.
 *
 * @param node - The node to evaluate.
 * @param time - The current animation time in seconds.
 */
function evaluateNode(node: SceneNode, time: number): void {
	if (node.hasClips) {
		const lists = node.clipLists;
		for (const prop of TRANSFORM_PROPS) {
			const target = node.transform[TRANSFORM_KEY[prop]];
			const axisClips = lists[prop];
			for (let axis = 0; axis < AXES.length; axis++) {
				target[axis] = evaluateTransformProperty(
					node,
					prop,
					axis,
					axisClips[axis],
					time,
				);
			}
		}
		node.dirty = true;

		let visible = node.originalVisible ? 1 : 0;
		const visibleClips = lists.visible;
		for (let i = 0; i < visibleClips.length; i++) {
			visible = evaluateClip(visibleClips[i], visible, time);
		}
		node.visible = visible !== 0;

		applyTexAnimation(node, time);
	}

	const children = node.children;
	for (let i = 0; i < children.length; i++) {
		evaluateNode(children[i], time);
	}
}

/**
 * Evaluates all animation motions across the scene graph at a given time.
 * Updates node transforms, visibility, and face UVs in-place, marking the
 * animated nodes as dirty.
 *
 * @param root - The root node of the scene graph.
 * @param time - The current animation time in seconds.
 */
export function evaluateMotions(root: SceneNode, time: number): void {
	const children = root.children;
	for (let i = 0; i < children.length; i++) {
		evaluateNode(children[i], time);
	}
}
