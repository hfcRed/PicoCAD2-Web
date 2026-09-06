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
 * @param out - The map to fill, cleared first.
 */
export function computeNodeBits(
	settings: RenderSettings,
	root: SceneNode,
	out: Map<SceneNode, number>,
): void {
	out.clear();

	let allBits = 0;
	const named: { bit: number; names: Set<string> }[] = [];

	for (const key of NODE_EFFECTS) {
		const effect = settings[key];
		if (!effect?.enabled) continue;
		const bit = NODE_BIT[key];
		if (effect.nodes.length === 0) {
			allBits |= bit;
		} else {
			named.push({ bit, names: new Set(effect.nodes) });
		}
	}

	const walk = (node: SceneNode, inherited: number): void => {
		let bits = inherited;
		for (const entry of named) {
			if (entry.names.has(node.name)) bits |= entry.bit;
		}
		out.set(node, bits | allBits);
		for (const child of node.children) walk(child, bits);
	};

	for (const child of root.children) walk(child, 0);
}
