import { mat4, vec3 } from "gl-matrix";
import type { CameraState, ProjectionMode } from "../types/scene.ts";
import { makeProjectionMatrix } from "./projection.ts";

const EPSILON = 0.00001;
const UP: vec3 = vec3.fromValues(0, 1, 0);

/** Orbital camera matching PicoCAD 2's spherical coordinate system. */
export class OrbitCamera {
	/** Horizontal orbit angle (azimuth) in radians. */
	omega = 0.5;
	/** Vertical orbit angle (elevation) in radians. */
	theta = 0.4;

	private _omegaOffset = 0;
	distanceToTarget = 20;
	target: vec3 = vec3.fromValues(0, 0, 0);
	zoom = 1;
	projectionMode: ProjectionMode = "perspective";

	/**
	 * Additional horizontal rotation offset in radians, applied on top of omega.
	 * Used by camera modes (spin, sway, pingpong) to add auto-rotation
	 * without modifying the user-controlled omega value.
	 */
	get omegaOffset(): number {
		return this._omegaOffset;
	}

	set omegaOffset(value: number) {
		if (this._omegaOffset !== value) {
			this._omegaOffset = value;
			this.needsUpdate = true;
		}
	}

	private readonly position: vec3 = vec3.create();
	private readonly viewMatrix: mat4 = mat4.create();
	private readonly projectionMatrix: mat4 = mat4.create();
	private readonly viewProjectionMatrix: mat4 = mat4.create();
	private needsUpdate = true;

	private lerping = false;
	private lerpStart = 0;
	private lerpDuration = 0;
	private lerpFrom: {
		target: vec3;
		distanceToTarget: number;
		theta: number;
		omega: number;
	} = {
		target: vec3.create(),
		distanceToTarget: 0,
		theta: 0,
		omega: 0,
	};
	private lerpTo: {
		target: vec3;
		distanceToTarget: number;
		theta: number;
		omega: number;
	} = {
		target: vec3.create(),
		distanceToTarget: 0,
		theta: 0,
		omega: 0,
	};

	/**
	 * Initializes the camera from a saved camera state.
	 *
	 * @param state - The camera state to restore.
	 * @param interpolateMs - Time in milliseconds to interpolate from the current state to the new one. Defaults to 0 (instant).
	 */
	initFromState(state: CameraState, interpolateMs = 0): void {
		if (interpolateMs <= 0) {
			this.lerping = false;
			vec3.copy(this.target, state.target);
			this.distanceToTarget = state.distanceToTarget;
			this.theta = state.theta;
			this.omega = state.omega;
			this.needsUpdate = true;
			return;
		}

		vec3.copy(this.lerpFrom.target, this.target);
		this.lerpFrom.distanceToTarget = this.distanceToTarget;
		this.lerpFrom.theta = this.theta;
		this.lerpFrom.omega = this.omega;

		vec3.copy(this.lerpTo.target, state.target);
		this.lerpTo.distanceToTarget = state.distanceToTarget;
		this.lerpTo.theta = state.theta;
		this.lerpTo.omega = state.omega;

		this.lerpStart = performance.now();
		this.lerpDuration = interpolateMs;
		this.lerping = true;
		this.needsUpdate = true;
	}

	/**
	 * If the camera is currently interpolating, resolves the lerp at its
	 * current progress into the base properties and stops the interpolation.
	 */
	cancelLerp(): void {
		if (!this.lerping) return;

		const elapsed = performance.now() - this.lerpStart;
		const t = Math.min(elapsed / this.lerpDuration, 1);
		const s = t * t * (3 - 2 * t);

		vec3.lerp(this.target, this.lerpFrom.target, this.lerpTo.target, s);
		this.distanceToTarget =
			this.lerpFrom.distanceToTarget +
			(this.lerpTo.distanceToTarget - this.lerpFrom.distanceToTarget) * s;
		this.theta =
			this.lerpFrom.theta + (this.lerpTo.theta - this.lerpFrom.theta) * s;
		this.omega =
			this.lerpFrom.omega + (this.lerpTo.omega - this.lerpFrom.omega) * s;

		this.lerping = false;
		this.needsUpdate = true;
	}

	/**
	 * Rotates the camera by adjusting omega and theta angles.
	 *
	 * @param deltaOmega - Change in horizontal angle.
	 * @param deltaTheta - Change in vertical angle.
	 */
	rotate(deltaOmega: number, deltaTheta: number): void {
		this.lerping = false;

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
		this.lerping = false;

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
		this.lerping = false;

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
		const omega = this.omega + this._omegaOffset;
		const cosTheta = Math.cos(this.theta);

		this.position[0] =
			this.target[0] + this.distanceToTarget * Math.cos(omega) * cosTheta;
		this.position[1] =
			this.target[1] + this.distanceToTarget * Math.sin(this.theta);
		this.position[2] =
			this.target[2] + this.distanceToTarget * Math.sin(omega) * cosTheta;
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
		makeProjectionMatrix(
			this.projectionMatrix,
			this.projectionMode,
			this.zoom,
			aspect,
			0.1,
			1000,
			this.distanceToTarget,
		);
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
		if (this.lerping) {
			const elapsed = performance.now() - this.lerpStart;
			const t = Math.min(elapsed / this.lerpDuration, 1);
			const s = t * t * (3 - 2 * t);

			vec3.lerp(this.target, this.lerpFrom.target, this.lerpTo.target, s);
			this.distanceToTarget =
				this.lerpFrom.distanceToTarget +
				(this.lerpTo.distanceToTarget - this.lerpFrom.distanceToTarget) * s;
			this.theta =
				this.lerpFrom.theta + (this.lerpTo.theta - this.lerpFrom.theta) * s;
			this.omega =
				this.lerpFrom.omega + (this.lerpTo.omega - this.lerpFrom.omega) * s;

			if (t >= 1) {
				this.lerping = false;
			}
		}

		this.updatePosition();
		mat4.lookAt(this.viewMatrix, this.position, this.target, UP);
		this.needsUpdate = this.lerping;
	}
}
