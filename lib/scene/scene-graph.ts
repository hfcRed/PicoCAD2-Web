import { mat4, vec3 } from "gl-matrix";
import type { SceneNode } from "../types/scene.ts";
import { computeLocalMatrix } from "./transform.ts";

const IDENTITY: mat4 = mat4.create();

export interface WorldBounds {
	min: [number, number, number];
	max: [number, number, number];
}

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
 * Computes effective visibility and world matrices for the scene graph.
 * A node is render-visible only if both it and all its ancestors are visible.
 * World matrices compose each node's local matrix with all ancestor matrices,
 * matching PicoCAD 2.2's scene graph (2.1 used each node's own transform only).
 *
 * @param root - The root node of the scene graph.
 */
export function updateRenderState(root: SceneNode): void {
	updateSubtree(root, true, IDENTITY, false);
}

function updateSubtree(
	node: SceneNode,
	parentVisible: boolean,
	parentWorld: mat4,
	parentDirty: boolean,
): void {
	for (const child of node.children) {
		child.renderVisible = child.visible && parentVisible;

		if (!child.renderVisible) {
			// Hidden subtrees keep stale matrices; mark them dirty so they
			// recompute against the current ancestor chain when they reappear.
			child.dirty = true;
			updateSubtree(child, false, IDENTITY, true);
			continue;
		}

		const dirty = child.dirty || parentDirty;
		if (dirty) {
			if (child.dirty) {
				computeLocalMatrix(child.localMatrix, child.transform);
			}
			mat4.multiply(child.worldMatrix, parentWorld, child.localMatrix);
			child.dirty = false;
		}

		updateSubtree(child, true, child.worldMatrix, dirty);
	}
}

/**
 * Computes the world-space bounding box of all visible non-ghost meshes in
 * their current pose. Call after {@link updateRenderState} so world
 * matrices are valid.
 *
 * @param root - The root node of the scene graph.
 * @returns The bounds, or a unit box around the origin if there is no geometry.
 */
export function computeWorldBounds(root: SceneNode): WorldBounds {
	const min: [number, number, number] = [Infinity, Infinity, Infinity];
	const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
	const v = vec3.create();

	traverseNode(root, (node) => {
		if (!node.mesh || node.ghost || !node.renderVisible) return;

		const vertices = node.mesh.vertices;
		for (let i = 0; i < vertices.length; i += 3) {
			vec3.set(v, vertices[i], vertices[i + 1], vertices[i + 2]);
			vec3.transformMat4(v, v, node.worldMatrix);
			for (let axis = 0; axis < 3; axis++) {
				if (v[axis] < min[axis]) min[axis] = v[axis];
				if (v[axis] > max[axis]) max[axis] = v[axis];
			}
		}
	});

	if (min[0] > max[0]) {
		return { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
	}
	return { min, max };
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
 * Snapshots the current transforms, visibility, and face UVs as static values
 * for the animation base. Called before animation starts to preserve the
 * original state, mirroring PicoCAD 2's store_static_transforms.
 *
 * @param root - The root node of the scene graph.
 */
export function storeStaticTransforms(root: SceneNode): void {
	traverseNode(root, (node) => {
		node.staticTransform.position.set(node.transform.position);
		node.staticTransform.rotation.set(node.transform.rotation);
		node.staticTransform.scale.set(node.transform.scale);
		node.originalVisible = node.visible;

		if (node.mesh) {
			for (const face of node.mesh.faces) {
				face.staticUvs.set(face.uvs);
			}
		}
	});
}

/**
 * Restores transforms, visibility, and face UVs from the static snapshot.
 * Only nodes with clips ever diverge from it, so only they are touched
 * and the other nodes keep their cached matrices.
 *
 * @param root - The root node of the scene graph.
 */
export function restoreStaticTransforms(root: SceneNode): void {
	const children = root.children;
	for (let i = 0; i < children.length; i++) {
		restoreNode(children[i]);
	}
}

/**
 * Restores a node's animated state and its descendants'.
 *
 * @param node - The node to restore.
 */
function restoreNode(node: SceneNode): void {
	if (node.hasClips) {
		node.transform.position.set(node.staticTransform.position);
		node.transform.rotation.set(node.staticTransform.rotation);
		node.transform.scale.set(node.staticTransform.scale);
		node.visible = node.originalVisible;
		node.dirty = true;

		// Only tex-animated nodes ever have UVs diverging from the snapshot.
		if (node.hasTexClips && node.mesh) {
			for (const face of node.mesh.faces) {
				face.uvs.set(face.staticUvs);
			}
			node.uvsDirty = true;
		}
	}

	const children = node.children;
	for (let i = 0; i < children.length; i++) {
		restoreNode(children[i]);
	}
}
