import type { SceneNode } from "../types/scene.ts";
import type { RenderSettings } from "./renderer.ts";

/**
 * One bit per model-pass effect that supports node selection. The bits of
 * every effect selecting a node are OR-ed into that node's `u_nodeBits`
 * uniform, so a single integer per draw tells the shaders which effects
 * apply. Must match the constants in `shaders/chunks/node-bits.glsl`.
 */
export const NODE_BIT = Object.freeze({
	interior: 1 << 0,
	gradientLight: 1 << 1,
	specular: 1 << 2,
	rimLight: 1 << 3,
	glitter: 1 << 4,
	emission: 1 << 5,
	dissolve: 1 << 6,
	colorCutout: 1 << 7,
	fur: 1 << 8,
	triangleFlash: 1 << 9,
	triangleShatter: 1 << 10,
	meshDeform: 1 << 11,
	projection: 1 << 12,
	vertexGlitch: 1 << 13,
	display: 1 << 14,
});

type NodeBitKey = keyof typeof NODE_BIT;

/** Settings keys whose effect carries a `nodes` selection, in bit order. */
const NODE_EFFECTS: readonly NodeBitKey[] = [
	"interior",
	"gradientLight",
	"specular",
	"rimLight",
	"glitter",
	"emission",
	"dissolve",
	"colorCutout",
	"fur",
	"triangleFlash",
	"triangleShatter",
	"meshDeform",
	"projection",
	"vertexGlitch",
	"display",
];

/**
 * The per-node effect bits of a frame. A weak map, so a disposed model's
 * nodes are not kept alive by the renderer that drew them.
 */
export type NodeBits = Pick<WeakMap<SceneNode, number>, "get">;

/** The named selections of the frame, reused across frames. */
const namedBits: number[] = [];
const namedNodes: string[][] = [];

/**
 * Computes the effect bits of every node in the scene graph into `out`.
 *
 * An effect with an empty `nodes` array selects every node. Otherwise a
 * node is selected when its own name or any ancestor's name is listed, so
 * naming a group selects the whole group, the same way billboard's
 * transform reaches a group's children. Nodes are matched by name only,
 * so several nodes sharing a name are all selected.
 *
 * Disabled effects contribute no bits, the shaders check the effect's
 * enabled flag separately, so this only matters for the voxel selection.
 *
 * @param settings - The current render settings holding the effects.
 * @param root - The scene graph root.
 * @param out - The map to fill. Every node of the graph is written.
 */
export function computeNodeBits(
	settings: RenderSettings,
	root: SceneNode,
	out: WeakMap<SceneNode, number>,
): void {
	let allBits = 0;
	namedBits.length = 0;
	namedNodes.length = 0;

	for (const key of NODE_EFFECTS) {
		const effect = settings[key];
		if (!effect?.enabled) continue;
		const bit = NODE_BIT[key];
		if (effect.nodes.length === 0) {
			allBits |= bit;
		} else {
			namedBits.push(bit);
			namedNodes.push(effect.nodes);
		}
	}

	const children = root.children;
	for (let i = 0; i < children.length; i++) {
		writeBits(children[i], 0, allBits, out);
	}
}

/**
 * Writes a node's bits and its descendants', inheriting the named
 * selections the ancestors matched.
 *
 * @param node - The node to write.
 * @param inherited - The named selection bits an ancestor matched.
 * @param allBits - The bits of the effects selecting every node.
 * @param out - The map to write.
 */
function writeBits(
	node: SceneNode,
	inherited: number,
	allBits: number,
	out: WeakMap<SceneNode, number>,
): void {
	let bits = inherited;
	for (let i = 0; i < namedBits.length; i++) {
		if (namedNodes[i].includes(node.name)) bits |= namedBits[i];
	}
	out.set(node, bits | allBits);

	const children = node.children;
	for (let i = 0; i < children.length; i++) {
		writeBits(children[i], bits, allBits, out);
	}
}
