import { mat4 } from "gl-matrix";
import { buildClipLists } from "../animation/animator.ts";
import type { RawGraphNode } from "../types/model.ts";
import type {
	Face,
	Mesh,
	MotionData,
	SceneNode,
	Transform,
} from "../types/scene.ts";
import { createEmptyMotions, parseMotions } from "./animation-parser.ts";

/**
 * Creates a Transform from raw position, rotation, and scale vectors.
 *
 * @param pos - Position as {x, y, z}.
 * @param rot - Rotation as {x, y, z} in radians.
 * @param scale - Scale as {x, y, z}.
 * @returns A Transform with Float32Array components.
 */
function createTransform(
	pos: { x: number; y: number; z: number },
	rot: { x: number; y: number; z: number },
	scale: { x: number; y: number; z: number },
): Transform {
	return {
		position: new Float32Array([pos.x, pos.y, pos.z]),
		rotation: new Float32Array([rot.x, rot.y, rot.z]),
		scale: new Float32Array([scale.x, scale.y, scale.z]),
	};
}

/**
 * Deep-clones a Transform by copying all Float32Array components.
 *
 * @param t - The transform to clone.
 * @returns A new Transform with independent copies of all arrays.
 */
function cloneTransform(t: Transform): Transform {
	return {
		position: new Float32Array(t.position),
		rotation: new Float32Array(t.rotation),
		scale: new Float32Array(t.scale),
	};
}

/**
 * Parses a raw mesh into the runtime representation.
 * Converts 1-based vertex IDs to 0-based.
 *
 * @param raw - The raw mesh data from the JSON node.
 * @returns The parsed mesh.
 */
function parseMesh(raw: NonNullable<RawGraphNode["mesh"]>): Mesh {
	const vertices = new Float32Array(raw.vertices);

	const faces: Face[] = raw.faces.map((rawFace) => {
		const uvs = new Float32Array(rawFace.uvs);
		return {
			vertexIndices: rawFace.vertex_ids.map((id) => id - 1),
			uvs,
			staticUvs: new Float32Array(uvs),
			color: rawFace.color,
			doubleSided: rawFace.dbl ?? false,
			priority: rawFace.prio ?? false,
			noShading: rawFace.noshade ?? false,
			noTexture: rawFace.notex ?? false,
		};
	});

	return { vertices, faces };
}

/**
 * Checks whether any clip in the motion data animates face UVs.
 *
 * @param motions - The parsed motion data.
 * @returns True if the motions contain a "tex" clip.
 */
function containsTexClips(motions: MotionData): boolean {
	return motions.tracks.some((track) =>
		track.some((clip) => clip.prop === "tex"),
	);
}

/**
 * Recursively parses a raw graph node into the runtime scene node representation.
 * Snapshots the initial transform and visibility as static values for animation.
 *
 * @param raw - The raw graph node from the JSON file.
 * @returns The parsed scene node with all children.
 */
function parseNode(raw: RawGraphNode): SceneNode {
	const transform = createTransform(
		raw.transform.pos,
		raw.transform.rot,
		raw.transform.scale,
	);

	const motions = raw.motions
		? parseMotions(raw.motions)
		: createEmptyMotions();

	const node: SceneNode = {
		name: raw.name,
		visible: raw.visible,
		renderVisible: raw.visible,
		ghost: raw.ghost ?? false,
		children: [],
		transform,
		staticTransform: cloneTransform(transform),
		originalVisible: raw.visible,
		mesh: raw.mesh ? parseMesh(raw.mesh) : null,
		motions,
		clipLists: buildClipLists(motions),
		hasClips: motions.tracks.some((track) => track.length > 0),
		hasTexClips: containsTexClips(motions),
		uvsDirty: false,
		dirty: true,
		localMatrix: mat4.create(),
		worldMatrix: mat4.create(),
	};

	node.children = raw.children.map(parseNode);

	return node;
}

/**
 * Parses the root graph node from a PicoCAD 2 file.
 * The root node itself is a container, its children are the actual scene objects.
 *
 * @param raw - The raw root graph node from the JSON file.
 * @returns The parsed root scene node.
 */
export function parseGraph(raw: RawGraphNode): SceneNode {
	return parseNode(raw);
}
