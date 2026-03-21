import { evaluateMotions } from "./animation/animator.ts";
import { OrbitCamera } from "./camera/orbit-camera.ts";
import { parseModel } from "./parser/parser.ts";
import { Renderer, type RenderSettings } from "./rendering/renderer.ts";
import {
	restoreStaticTransforms,
	storeStaticTransforms,
} from "./scene/scene-graph.ts";
import type { PicoCAD2ViewerOptions } from "./types/options.ts";
import type { PicoCAD2Model } from "./types/scene.ts";

/** Controls animation playback state and timing. */
class AnimationController {
	private duration = 0;

	playing = false;
	speed = 1;
	time = 0;
	loop = true;

	/**
	 * Sets the animation duration from the model.
	 *
	 * @param duration - The animation duration in seconds.
	 */
	setDuration(duration: number): void {
		this.duration = duration;
	}

	/**
	 * Starts playback.
	 */
	play(): void {
		this.playing = true;
	}

	/**
	 * Pauses playback.
	 */
	pause(): void {
		this.playing = false;
	}

	/**
	 * Stops playback and resets time to 0.
	 */
	stop(): void {
		this.playing = false;
		this.time = 0;
	}

	/**
	 * Seeks to a specific time.
	 *
	 * @param t - The time to seek to in seconds.
	 */
	setTime(t: number): void {
		this.time = t;
	}

	/**
	 * Advances the animation by a time delta.
	 *
	 * @param dt - The time delta in seconds.
	 */
	advance(dt: number): void {
		if (!this.playing) return;

		this.time += dt * this.speed;

		if (this.duration > 0 && this.loop) {
			this.time = this.time % this.duration;
			if (this.time < 0) {
				this.time += this.duration;
			}
		}
	}
}

/**
 * The main PicoCAD 2 viewer class.
 * Provides a complete API for loading, rendering, and interacting with PicoCAD 2 models.
 */
export class PicoCAD2Viewer {
	readonly canvas: HTMLCanvasElement;
	readonly gl: WebGL2RenderingContext;
	readonly camera: OrbitCamera = new OrbitCamera();
	readonly animation: AnimationController = new AnimationController();

	shading = true;
	renderMode: "texture" | "color" | "none" = "texture";
	wireframe = false;
	wireframeColor: [number, number, number] = [1, 1, 1];

	private renderer: Renderer;
	private model: PicoCAD2Model | null = null;
	private animationFrameId: number | null = null;
	private lastFrameTime = 0;
	private cameraControlsEnabled = false;
	private dragButton = 0;
	private activePointers: Map<number, { x: number; y: number }> = new Map();
	private pinchStartDist = 0;
	private pinchMidpoint: { x: number; y: number } = { x: 0, y: 0 };
	private inertiaActive = false;
	private inertiaX = 0;
	private inertiaY = 0;
	private readonly boundHandlers: {
		onPointerDown: (e: PointerEvent) => void;
		onPointerMove: (e: PointerEvent) => void;
		onPointerUp: (e: PointerEvent) => void;
		onWheel: (e: WheelEvent) => void;
		onContextMenu: (e: Event) => void;
		onTouchStart: (e: TouchEvent) => void;
	};

	/**
	 * Creates a new PicoCAD 2 viewer.
	 *
	 * @param options - Configuration options.
	 */
	constructor(options?: PicoCAD2ViewerOptions) {
		this.canvas = options?.canvas ?? document.createElement("canvas");

		const resolution = options?.resolution;
		if (resolution) {
			const scale = resolution.scale ?? 1;
			this.canvas.width = resolution.width;
			this.canvas.height = resolution.height;
			this.canvas.style.width = `${resolution.width * scale}px`;
			this.canvas.style.height = `${resolution.height * scale}px`;
		}

		const gl = this.canvas.getContext("webgl2", {
			antialias: false,
			alpha: false,
		});
		if (!gl) throw new Error("WebGL 2 is not supported");
		this.gl = gl;

		this.renderer = new Renderer(gl);

		if (options?.shading !== undefined) this.shading = options.shading;
		if (options?.renderMode) this.renderMode = options.renderMode;
		if (options?.wireframe !== undefined) this.wireframe = options.wireframe;
		if (options?.wireframeColor) this.wireframeColor = options.wireframeColor;
		if (options?.animationSpeed !== undefined) {
			this.animation.speed = options.animationSpeed;
		}

		this.boundHandlers = {
			onPointerDown: this.onPointerDown.bind(this),
			onPointerMove: this.onPointerMove.bind(this),
			onPointerUp: this.onPointerUp.bind(this),
			onWheel: this.onWheel.bind(this),
			onContextMenu: (e: Event) => e.preventDefault(),
			onTouchStart: (e: TouchEvent) => e.preventDefault(),
		};
	}

	/**
	 * Whether a model is currently loaded.
	 *
	 * @returns True if a model is loaded.
	 */
	get loaded(): boolean {
		return this.model !== null;
	}

	/**
	 * Loads a PicoCAD 2 model from a JSON string.
	 *
	 * @param source - The raw JSON string content of the model file.
	 */
	load(source: string): void {
		this.model = parseModel(source);
		this.renderer.loadModel(this.model);
		this.animation.setDuration(this.model.motionDuration);
		this.animation.time = 0;
		this.shading = this.model.shadingEnabled;

		if (this.model.camera) {
			this.camera.initFromState(this.model.camera);
		}

		storeStaticTransforms(this.model.root);
	}

	/**
	 * Loads a PicoCAD 2 model from a File object.
	 *
	 * @param file - The file to read.
	 */
	async loadFromFile(file: File): Promise<void> {
		const text = await file.text();
		this.load(text);
	}

	/**
	 * Draws a single frame.
	 */
	draw(): void {
		if (!this.model) return;

		if (this.animation.playing || this.animation.time > 0) {
			restoreStaticTransforms(this.model.root);
			evaluateMotions(this.model.root, this.animation.time);
		}

		const settings: RenderSettings = {
			shading: this.shading,
			renderMode:
				this.renderMode === "texture" ? 0 : this.renderMode === "color" ? 1 : 2,
			wireframe: this.wireframe,
			wireframeColor: this.wireframeColor,
		};

		this.renderer.draw(this.camera, settings);
	}

	/**
	 * Starts the render loop.
	 */
	startRenderLoop(): void {
		if (this.animationFrameId !== null) return;

		this.lastFrameTime = performance.now();
		const loop = (now: number): void => {
			const dt = (now - this.lastFrameTime) / 1000;
			this.lastFrameTime = now;

			this.applyInertia();
			this.animation.advance(dt);
			this.draw();

			this.animationFrameId = requestAnimationFrame(loop);
		};

		this.animationFrameId = requestAnimationFrame(loop);
	}

	/**
	 * Stops the render loop.
	 */
	stopRenderLoop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	/**
	 * Enables mouse/touch camera controls on the canvas.
	 */
	enableCameraControls(): void {
		if (this.cameraControlsEnabled) return;
		this.cameraControlsEnabled = true;

		this.canvas.addEventListener(
			"pointerdown",
			this.boundHandlers.onPointerDown,
		);
		this.canvas.addEventListener(
			"pointermove",
			this.boundHandlers.onPointerMove,
		);
		this.canvas.addEventListener("pointerup", this.boundHandlers.onPointerUp);
		this.canvas.addEventListener(
			"pointerleave",
			this.boundHandlers.onPointerUp,
		);
		this.canvas.addEventListener("wheel", this.boundHandlers.onWheel, {
			passive: false,
		});
		this.canvas.addEventListener(
			"contextmenu",
			this.boundHandlers.onContextMenu,
		);
		this.canvas.addEventListener(
			"touchstart",
			this.boundHandlers.onTouchStart,
			{
				passive: false,
			},
		);
		this.canvas.style.touchAction = "none";
	}

	/**
	 * Disables mouse/touch camera controls.
	 */
	disableCameraControls(): void {
		if (!this.cameraControlsEnabled) return;
		this.cameraControlsEnabled = false;

		this.canvas.removeEventListener(
			"pointerdown",
			this.boundHandlers.onPointerDown,
		);
		this.canvas.removeEventListener(
			"pointermove",
			this.boundHandlers.onPointerMove,
		);
		this.canvas.removeEventListener(
			"pointerup",
			this.boundHandlers.onPointerUp,
		);
		this.canvas.removeEventListener(
			"pointerleave",
			this.boundHandlers.onPointerUp,
		);
		this.canvas.removeEventListener("wheel", this.boundHandlers.onWheel);
		this.canvas.removeEventListener(
			"contextmenu",
			this.boundHandlers.onContextMenu,
		);
		this.canvas.removeEventListener(
			"touchstart",
			this.boundHandlers.onTouchStart,
		);
		this.canvas.style.touchAction = "";
	}

	/**
	 * Updates the canvas resolution.
	 *
	 * @param width - The display width in pixels.
	 * @param height - The display height in pixels.
	 * @param scale - The pixel scale factor (default: 1).
	 */
	setResolution(width: number, height: number, scale = 1): void {
		this.canvas.width = width;
		this.canvas.height = height;
		this.canvas.style.width = `${width * scale}px`;
		this.canvas.style.height = `${height * scale}px`;
	}

	/**
	 * Frees all resources held by the viewer.
	 */
	dispose(): void {
		this.stopRenderLoop();
		this.disableCameraControls();
		this.renderer.dispose();
		this.model = null;
	}

	/**
	 * Applies inertia decay to the camera after a drag gesture ends.
	 */
	private applyInertia(): void {
		if (!this.inertiaActive) return;

		const decay = 0.92;
		this.inertiaX *= decay;
		this.inertiaY *= decay;

		const speed = Math.sqrt(
			this.inertiaX * this.inertiaX + this.inertiaY * this.inertiaY,
		);
		if (speed < 0.0001) {
			this.inertiaActive = false;
			return;
		}

		this.camera.rotate(this.inertiaX, this.inertiaY);
	}

	/**
	 * Computes the distance between two active pointers.
	 *
	 * @returns The distance in pixels, or 0 if fewer than 2 pointers.
	 */
	private getPointerDistance(): number {
		if (this.activePointers.size < 2) return 0;
		const pts = [...this.activePointers.values()];
		const dx = pts[1].x - pts[0].x;
		const dy = pts[1].y - pts[0].y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/**
	 * Computes the midpoint between two active pointers.
	 *
	 * @returns The midpoint as {x, y}, or {0, 0} if fewer than 2 pointers.
	 */
	private getPointerMidpoint(): { x: number; y: number } {
		if (this.activePointers.size < 2) return { x: 0, y: 0 };
		const pts = [...this.activePointers.values()];
		return {
			x: (pts[0].x + pts[1].x) / 2,
			y: (pts[0].y + pts[1].y) / 2,
		};
	}

	/**
	 * Handles pointer down events.
	 *
	 * @param e - The pointer event.
	 */
	private onPointerDown(e: PointerEvent): void {
		this.inertiaActive = false;
		this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		this.dragButton = e.button;
		this.canvas.setPointerCapture(e.pointerId);

		if (this.activePointers.size === 2) {
			this.pinchStartDist = this.getPointerDistance();
			this.pinchMidpoint = this.getPointerMidpoint();
		}
	}

	/**
	 * Handles pointer move events.
	 *
	 * @param e - The pointer event.
	 */
	private onPointerMove(e: PointerEvent): void {
		if (!this.activePointers.has(e.pointerId)) return;

		const prev = this.activePointers.get(e.pointerId);
		if (!prev) return;

		const dx = e.clientX - prev.x;
		const dy = e.clientY - prev.y;
		this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (this.activePointers.size === 2) {
			const newDist = this.getPointerDistance();
			if (this.pinchStartDist > 0) {
				const delta = this.pinchStartDist - newDist;
				this.camera.zoomBy(delta * 0.1);
			}
			this.pinchStartDist = newDist;

			const newMid = this.getPointerMidpoint();
			const mdx = newMid.x - this.pinchMidpoint.x;
			const mdy = newMid.y - this.pinchMidpoint.y;
			const panScale = this.camera.distanceToTarget * 0.005;

			this.camera.pan(mdx * panScale, mdy * panScale);
			this.pinchMidpoint = newMid;
		} else if (this.activePointers.size === 1) {
			if (e.pointerType === "touch" || this.dragButton === 0) {
				this.camera.rotate(-dx * 0.01, dy * 0.01);
				this.inertiaX = -dx * 0.01;
				this.inertiaY = dy * 0.01;
			} else if (this.dragButton === 1 || this.dragButton === 2) {
				const panScale = this.camera.distanceToTarget * 0.005;
				this.camera.pan(dx * panScale, dy * panScale);
			}
		}
	}

	/**
	 * Handles pointer up and pointer leave events.
	 *
	 * @param e - The pointer event.
	 */
	private onPointerUp(e: PointerEvent): void {
		const hadMultiple = this.activePointers.size >= 2;
		this.activePointers.delete(e.pointerId);
		try {
			this.canvas.releasePointerCapture(e.pointerId);
		} catch {}

		if (this.activePointers.size === 1) {
			this.pinchStartDist = 0;
		}

		if (this.activePointers.size === 0) {
			const isRotate =
				!hadMultiple && (e.pointerType === "touch" || this.dragButton === 0);
			const speed = Math.sqrt(
				this.inertiaX * this.inertiaX + this.inertiaY * this.inertiaY,
			);
			this.inertiaActive = isRotate && speed > 0.001;
		}
	}

	/**
	 * Handles wheel events for zooming.
	 *
	 * @param e - The wheel event.
	 */
	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		this.camera.zoomBy(e.deltaY * 0.05);
	}
}
