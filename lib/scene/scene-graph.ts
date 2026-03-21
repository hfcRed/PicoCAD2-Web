import type { SceneNode } from "../types/scene.ts";
import { computeLocalMatrix } from "./transform.ts";

/**
 * Traverses the scene graph in preorder, calling the callback on each child node.
 * Skips subtrees where the continue check returns false (used for visibility gating).
 *
 * @param node - The parent node whose children to traverse.
 * @param callback - Function called for each child node.
 * @param continueCheck - Optional function that returns false to skip a node's subtree.
 */
export function traverseNode(
	node: SceneNode,
	callback: (node: SceneNode) => void,
	continueCheck?: (node: SceneNode) => boolean,
): void {
	for (const child of node.children) {
		callback(child);
		if (!continueCheck || continueCheck(child)) {
			traverseNode(child, callback, continueCheck);
		}
	}
}

/**
 * Updates the local matrix of a scene node if it is marked as dirty.
 * PicoCAD 2 does NOT propagate parent transforms to children;
 * each node's matrix is computed solely from its own transform.
 *
 * @param node - The scene node to update.
 */
export function updateNodeMatrix(node: SceneNode): void {
	if (!node.dirty) return;
	computeLocalMatrix(node.localMatrix, node.transform);
	node.dirty = false;
}

/**
 * Marks all nodes in the scene graph as dirty, forcing matrix recomputation.
 *
 * @param root - The root node of the scene graph.
 */
export function markAllDirty(root: SceneNode): void {
	traverseNode(root, (node) => {
		node.dirty = true;
	});
}

/**
 * Snapshots the current transforms and visibility as static values for animation base.
 * Called before animation starts to preserve the original state.
 *
 * @param root - The root node of the scene graph.
 */
export function storeStaticTransforms(root: SceneNode): void {
	traverseNode(root, (node) => {
		node.staticTransform.position.set(node.transform.position);
		node.staticTransform.rotation.set(node.transform.rotation);
		node.staticTransform.scale.set(node.transform.scale);
		node.originalVisible = node.visible;
	});
}

/**
 * Restores transforms and visibility from the static snapshot.
 *
 * @param root - The root node of the scene graph.
 */
export function restoreStaticTransforms(root: SceneNode): void {
	traverseNode(root, (node) => {
		node.transform.position.set(node.staticTransform.position);
		node.transform.rotation.set(node.staticTransform.rotation);
		node.transform.scale.set(node.staticTransform.scale);
		node.visible = node.originalVisible;
		node.dirty = true;
	});
}
