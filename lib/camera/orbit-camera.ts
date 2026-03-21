import { mat4, vec3 } from "gl-matrix";
import type { CameraState } from "../types/scene.ts";
import { makePerspectiveMatrix } from "./projection.ts";

const EPSILON = 0.00001;
const UP: vec3 = vec3.fromValues(0, 1, 0);

/** Orbital camera matching PicoCAD 2's spherical coordinate system. */
export class OrbitCamera {
	/** Horizontal orbit angle (azimuth) in radians. */
	omega = 0.5;
	/** Vertical orbit angle (elevation) in radians. */
	theta = 0.4;

	distanceToTarget = 20;
	target: vec3 = vec3.fromValues(0, 0, 0);
	zoom = 1;

	private readonly position: vec3 = vec3.create();
	private readonly viewMatrix: mat4 = mat4.create();
	private readonly projectionMatrix: mat4 = mat4.create();
	private readonly viewProjectionMatrix: mat4 = mat4.create();
	private needsUpdate = true;

	/**
	 * Initializes the camera from a saved camera state.
	 *
	 * @param state - The camera state to restore.
	 */
	initFromState(state: CameraState): void {
		vec3.copy(this.target, state.target);
		this.distanceToTarget = state.distanceToTarget;
		this.theta = state.theta;
		this.omega = state.omega;
		this.needsUpdate = true;
	}

	/**
	 * Rotates the camera by adjusting omega and theta angles.
	 *
	 * @param deltaOmega - Change in horizontal angle.
	 * @param deltaTheta - Change in vertical angle.
	 */
	rotate(deltaOmega: number, deltaTheta: number): void {
		this.omega += deltaOmega;
		this.theta += deltaTheta;
		this.theta = Math.max(
			-Math.PI / 2 + EPSILON,
			Math.min(Math.PI / 2 - EPSILON, this.theta),
		);
		this.needsUpdate = true;
	}

	/**
	 * Zooms the camera by adjusting the distance to target.
	 *
	 * @param delta - The zoom delta.
	 */
	zoomBy(delta: number): void {
		this.distanceToTarget = Math.max(1, this.distanceToTarget + delta);
		this.needsUpdate = true;
	}

	/**
	 * Pans the camera target point.
	 *
	 * @param dx - Horizontal pan amount.
	 * @param dy - Vertical pan amount.
	 */
	pan(dx: number, dy: number): void {
		const cosOmega = Math.cos(this.omega);
		const sinOmega = Math.sin(this.omega);

		this.target[0] += sinOmega * dx;
		this.target[2] -= cosOmega * dx;
		this.target[1] += dy;
		this.needsUpdate = true;
	}

	/**
	 * Computes the camera position from spherical coordinates.
	 */
	private updatePosition(): void {
		const cosTheta = Math.cos(this.theta);
		this.position[0] =
			this.target[0] + this.distanceToTarget * Math.cos(this.omega) * cosTheta;
		this.position[1] =
			this.target[1] + this.distanceToTarget * Math.sin(this.theta);
		this.position[2] =
			this.target[2] + this.distanceToTarget * Math.sin(this.omega) * cosTheta;
	}

	/**
	 * Returns the view matrix, recomputing if the camera has changed.
	 *
	 * @returns The current view matrix.
	 */
	getViewMatrix(): mat4 {
		if (this.needsUpdate) {
			this.update();
		}
		return this.viewMatrix;
	}

	/**
	 * Returns the projection matrix for the given aspect ratio, recomputing if needed.
	 *
	 * @param aspect - The viewport aspect ratio.
	 * @returns The current projection matrix.
	 */
	getProjectionMatrix(aspect: number): mat4 {
		makePerspectiveMatrix(this.projectionMatrix, this.zoom, aspect, 0.1, 1000);
		return this.projectionMatrix;
	}

	/**
	 * Returns the combined view-projection matrix.
	 *
	 * @param aspect - The viewport aspect ratio.
	 * @returns The view-projection matrix.
	 */
	getViewProjectionMatrix(aspect: number): mat4 {
		if (this.needsUpdate) {
			this.update();
		}
		const proj = this.getProjectionMatrix(aspect);
		mat4.multiply(this.viewProjectionMatrix, proj, this.viewMatrix);
		return this.viewProjectionMatrix;
	}

	/**
	 * Recalculates position and view matrix from current spherical coordinates.
	 */
	private update(): void {
		this.updatePosition();
		mat4.lookAt(this.viewMatrix, this.position, this.target, UP);
		this.needsUpdate = false;
	}
}
