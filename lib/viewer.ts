import { evaluateMotions } from "./animation/animator.ts";
import { OrbitCamera } from "./camera/orbit-camera.ts";
import { PicoCAD2Context } from "./context.ts";
import { parseModel } from "./parser/parser.ts";
import { PostProcessPipeline } from "./rendering/effects/pipeline.ts";
import type { ModelResources, RenderSettings } from "./rendering/renderer.ts";
import {
	restoreStaticTransforms,
	storeStaticTransforms,
} from "./scene/scene-graph.ts";
import type {
	ExtrasOptions,
	PicoCAD2ViewerOptions,
	PicoCAD2ViewerState,
} from "./types/options.ts";
import type {
	CameraMode,
	Color3,
	PicoCAD2Model,
	ProjectionMode,
	RenderMode,
} from "./types/scene.ts";
import { ViewerExtras } from "./viewer-extras.ts";

export interface ViewerTag {
	text: string;
	color?: Color3;
}

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
 *
 * Uses a shared {@link PicoCAD2Context} for WebGL rendering. If no context is provided,
 * one is created internally. Multiple viewers can share a single context to avoid
 * the browser's ~16 active WebGL context limit.
 */
export class PicoCAD2Viewer {
	readonly canvas: HTMLCanvasElement;
	readonly camera: OrbitCamera = new OrbitCamera();
	readonly animation: AnimationController = new AnimationController();
	readonly extras: ViewerExtras;
	private readonly pipeline: PostProcessPipeline = new PostProcessPipeline();

	shading = true;
	renderMode: RenderMode = "texture";
	projectionMode: ProjectionMode = "perspective";
	outlineSize = 0;
	outlineColor: Color3 = [0, 0, 0];
	scanlines = false;
	scanlineColor: Color3 = [0, 0, 0];
	leftTag: ViewerTag | null = null;
	rightTag: ViewerTag | null = null;
	cameraMode: CameraMode = "fixed";
	cameraModeSpeed = 5;
	cameraModeDirection: "left" | "right" = "left";

	private context: PicoCAD2Context;
	private ownsContext: boolean;
	private ctx2d: CanvasRenderingContext2D;
	private source: string | null = null;
	private model: PicoCAD2Model | null = null;
	private resources: ModelResources | null = null;
	private renderWidth = 128;
	private renderHeight = 128;
	private renderScale = 1;
	private animationFrameId: number | null = null;
	private lastFrameTime = 0;
	private elapsedTime = 0;
	private cameraControlsEnabled = false;
	private dragButton = 0;
	private activePointers: Map<number, { x: number; y: number }> = new Map();
	private pinchStartDist = 0;
	private pinchMidpoint: { x: number; y: number } = { x: 0, y: 0 };
	private cameraModeTime = 0;
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

		if (options?.context) {
			this.context = options.context;
			this.ownsContext = false;
		} else {
			this.context = new PicoCAD2Context();
			this.ownsContext = true;
		}

		const ctx2d = this.canvas.getContext("2d");
		if (!ctx2d) throw new Error("Could not get 2D canvas context");
		ctx2d.imageSmoothingEnabled = false;
		this.ctx2d = ctx2d;

		this.extras = new ViewerExtras(this.pipeline);

		const resolution = options?.resolution;
		if (resolution) {
			this.setResolution(resolution.width, resolution.height, resolution.scale);
		}

		if (options?.shading !== undefined) this.shading = options.shading;
		if (options?.renderMode) this.renderMode = options.renderMode;
		if (options?.projectionMode) this.projectionMode = options.projectionMode;
		if (options?.outlineSize !== undefined)
			this.outlineSize = options.outlineSize;
		if (options?.outlineColor) this.outlineColor = options.outlineColor;
		if (options?.scanlines !== undefined) this.scanlines = options.scanlines;
		if (options?.scanlineColor) this.scanlineColor = options.scanlineColor;
		if (options?.animationSpeed !== undefined) {
			this.animation.speed = options.animationSpeed;
		}
		if (options?.cameraMode) this.cameraMode = options.cameraMode;
		if (options?.cameraModeSpeed !== undefined) {
			this.cameraModeSpeed = options.cameraModeSpeed;
		}
		if (options?.cameraModeDirection) {
			this.cameraModeDirection = options.cameraModeDirection;
		}

		if (options?.extras) {
			this.applyExtrasOptions(options.extras);
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
	 * The WebGL 2 rendering context used by this viewer.
	 *
	 * @returns The shared WebGL 2 context.
	 */
	get gl(): WebGL2RenderingContext {
		return this.context.gl;
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
		if (this.resources) {
			this.context.disposeModelResources(this.resources);
			this.resources = null;
		}

		this.source = source;
		this.model = parseModel(source);
		this.resources = this.context.createModelResources(this.model);
		this.shading = this.model.shadingEnabled;
		this.projectionMode = this.model.projectionMode;

		this.animation.setDuration(this.model.motionDuration);
		this.animation.time = 0;

		const es = this.model.exportSettings;
		this.cameraMode = es.cameraMode;
		this.cameraModeDirection = es.cameraModeDirection;
		this.cameraModeSpeed = es.cameraModeSpeed;
		this.outlineSize = es.outlineSize;
		this.outlineColor = es.outlineColor;
		this.scanlines = es.scanlines;
		this.scanlineColor = es.scanlineColor;

		if (es.animate) {
			this.animation.play();
		}

		if (es.watermark) {
			this.rightTag = { text: es.watermark, color: es.watermarkColor };
		} else {
			this.rightTag = null;
		}

		if (es.watermark2) {
			this.leftTag = { text: es.watermark2, color: es.watermark2Color };
		} else {
			this.leftTag = null;
		}

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
		if (!this.model || !this.resources) return;

		this.camera.projectionMode = this.projectionMode;
		this.camera.omegaOffset = this.computeCameraModeOffset();

		if (this.animation.playing || this.animation.time > 0) {
			restoreStaticTransforms(this.model.root);
			evaluateMotions(this.model.root, this.animation.time);
		}

		const settings: RenderSettings = {
			shading: this.shading,
			renderMode:
				this.renderMode === "texture" ? 0 : this.renderMode === "color" ? 1 : 2,
			outlineSize: this.outlineSize,
			outlineColor: this.outlineColor,
		};

		const w = this.renderWidth;
		const h = this.renderHeight;
		const s = this.renderScale;
		const dw = w * s;
		const dh = h * s;

		this.context.render(
			this.camera,
			settings,
			this.model,
			this.resources,
			w,
			h,
			this.elapsedTime,
			this.pipeline,
		);

		// Use transferToImageBitmap to atomically capture the WebGL drawing buffer.
		// Direct drawImage from a shared WebGL OffscreenCanvas can read stale content
		// when multiple viewers render in sequence within the same frame.
		const bitmap = this.context.canvas.transferToImageBitmap();
		this.ctx2d.drawImage(bitmap, 0, 0, w, h, 0, 0, dw, dh);
		bitmap.close();

		if (this.scanlines) {
			const [sr, sg, sb] = this.scanlineColor;
			this.ctx2d.fillStyle = `rgba(${Math.round(sr * 255)},${Math.round(sg * 255)},${Math.round(sb * 255)},0.25)`;
			for (let y = 0; y < dh; y += 2 * s) {
				this.ctx2d.fillRect(0, y, dw, s);
			}
		}

		const font = this.context.font;
		if (font && s > 0) {
			this.ctx2d.save();
			this.ctx2d.scale(s, s);
			if (this.leftTag) {
				font.drawText(
					this.ctx2d,
					this.leftTag.text,
					2,
					h - 10,
					this.leftTag.color ?? [1, 1, 1],
				);
			}

			if (this.rightTag) {
				font.drawText(
					this.ctx2d,
					this.rightTag.text,
					w - 2,
					h - 10,
					this.rightTag.color ?? [1, 1, 1],
					true,
				);
			}
			this.ctx2d.restore();
		}
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
			this.elapsedTime += dt;

			this.applyInertia();
			this.animation.advance(dt);
			this.cameraModeTime += dt;
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
	 * The scene renders at `width × height`, then is upscaled by `scale` with
	 * nearest-neighbor interpolation, matching PicoCAD 2's export behavior.
	 *
	 * @param width - The render width in pixels.
	 * @param height - The render height in pixels.
	 * @param scale - The pixel scale factor (default: 1).
	 */
	setResolution(width: number, height: number, scale = 1): void {
		this.renderWidth = width;
		this.renderHeight = height;
		this.renderScale = scale;
		this.canvas.width = width * scale;
		this.canvas.height = height * scale;
		this.ctx2d.imageSmoothingEnabled = false;
		this.canvas.style.width = `${width * scale}px`;
		this.canvas.style.height = `${height * scale}px`;
	}

	/**
	 * Returns the last rendered frame as a Blob.
	 *
	 * @param type - The image MIME type (default: "image/png").
	 * @param quality - The image quality for lossy formats (0–1).
	 * @returns A promise that resolves to the image Blob.
	 */
	toBlob(type = "image/png", quality?: number): Promise<Blob> {
		return new Promise((resolve, reject) => {
			this.canvas.toBlob(
				(blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error("Failed to create image blob"));
					}
				},
				type,
				quality,
			);
		});
	}

	/**
	 * Returns the last rendered frame as a data URL string.
	 *
	 * @param type - The image MIME type (default: "image/png").
	 * @param quality - The image quality for lossy formats (0–1).
	 * @returns The data URL.
	 */
	toDataURL(type = "image/png", quality?: number): string {
		return this.canvas.toDataURL(type, quality);
	}

	/**
	 * Starts observing the canvas's parent element for size changes and
	 * automatically updates the render resolution to match.
	 *
	 * @param scale - The pixel scale factor applied to the container size (default: 1).
	 */
	watchResize(scale = 1): void {
		this.unwatchResize();
		const parent = this.canvas.parentElement;
		if (!parent) return;

		this.resizeScale = scale;
		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					this.setResolution(
						Math.round(width / this.resizeScale),
						Math.round(height / this.resizeScale),
						this.resizeScale,
					);
				}
			}
		});
		this.resizeObserver.observe(parent);

		const { clientWidth, clientHeight } = parent;
		if (clientWidth > 0 && clientHeight > 0) {
			this.setResolution(
				Math.round(clientWidth / scale),
				Math.round(clientHeight / scale),
				scale,
			);
		}
	}

	/**
	 * Stops observing the canvas's parent element for size changes.
	 */
	unwatchResize(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	/**
	 * Frees all resources held by the viewer.
	 */
	dispose(): void {
		this.stopRenderLoop();
		this.disableCameraControls();

		if (this.resources) {
			this.context.disposeModelResources(this.resources);
			this.resources = null;
		}

		this.pipeline.dispose(this.context.gl);

		if (this.ownsContext) {
			this.context.dispose();
		}

		this.source = null;
		this.model = null;
	}

	/**
	 * Returns a JSON-serializable snapshot of the viewer's complete state,
	 * including the raw model source, all settings, and extras.
	 */
	getState(): PicoCAD2ViewerState {
		return {
			source: this.source,
			settings: {
				shading: this.shading,
				renderMode: this.renderMode,
				projectionMode: this.projectionMode,
				outlineSize: this.outlineSize,
				outlineColor: [...this.outlineColor],
				scanlines: this.scanlines,
				scanlineColor: [...this.scanlineColor],
				cameraMode: this.cameraMode,
				cameraModeSpeed: this.cameraModeSpeed,
				cameraModeDirection: this.cameraModeDirection,
				leftTag: this.leftTag
					? { text: this.leftTag.text, color: this.leftTag.color ?? [1, 1, 1] }
					: null,
				rightTag: this.rightTag
					? {
							text: this.rightTag.text,
							color: this.rightTag.color ?? [1, 1, 1],
						}
					: null,
				animationSpeed: this.animation.speed,
				animationTime: this.animation.time,
				animationPlaying: this.animation.playing,
				animationLoop: this.animation.loop,
				camera: {
					omega: this.camera.omega,
					theta: this.camera.theta,
					distanceToTarget: this.camera.distanceToTarget,
					target: [
						this.camera.target[0],
						this.camera.target[1],
						this.camera.target[2],
					],
					zoom: this.camera.zoom,
				},
			},
			extras: this.getExtrasState(),
		};
	}

	/**
	 * Restores the viewer from a previously captured state.
	 * If the state includes a model source, it will be loaded.
	 *
	 * @param state - The state to restore.
	 */
	setState(state: PicoCAD2ViewerState): void {
		if (state.source !== null) {
			this.load(state.source);
		}

		const s = state.settings;
		this.shading = s.shading;
		this.renderMode = s.renderMode;
		this.projectionMode = s.projectionMode;
		this.outlineSize = s.outlineSize;
		this.outlineColor = [...s.outlineColor];
		this.scanlines = s.scanlines;
		this.scanlineColor = [...s.scanlineColor];
		this.cameraMode = s.cameraMode;
		this.cameraModeSpeed = s.cameraModeSpeed;
		this.cameraModeDirection = s.cameraModeDirection;
		this.leftTag = s.leftTag
			? { text: s.leftTag.text, color: s.leftTag.color ?? [1, 1, 1] }
			: null;
		this.rightTag = s.rightTag
			? { text: s.rightTag.text, color: s.rightTag.color ?? [1, 1, 1] }
			: null;

		this.animation.speed = s.animationSpeed;
		this.animation.time = s.animationTime;
		if (s.animationPlaying) {
			this.animation.play();
		} else {
			this.animation.pause();
		}
		this.animation.loop = s.animationLoop;

		this.camera.omega = s.camera.omega;
		this.camera.theta = s.camera.theta;
		this.camera.distanceToTarget = s.camera.distanceToTarget;
		this.camera.target[0] = s.camera.target[0];
		this.camera.target[1] = s.camera.target[1];
		this.camera.target[2] = s.camera.target[2];
		this.camera.zoom = s.camera.zoom;

		this.applyExtrasOptions(state.extras);
	}

	/**
	 * Reads current extras effect properties into a plain object.
	 */
	private getExtrasState(): Required<ExtrasOptions> {
		const e = this.extras;
		return {
			wireframe: {
				enabled: e.wireframe.enabled,
				color: [...e.wireframe.color],
			},
			gradientOutline: {
				enabled: e.gradientOutline.enabled,
				size: e.gradientOutline.size,
				colorFrom: [...e.gradientOutline.colorFrom],
				colorTo: [...e.gradientOutline.colorTo],
				gradient: e.gradientOutline.gradient,
				gradientDirection: e.gradientOutline.gradientDirection,
			},
			colorGrading: {
				enabled: e.colorGrading.enabled,
				brightness: e.colorGrading.brightness,
				contrast: e.colorGrading.contrast,
				saturation: e.colorGrading.saturation,
				hue: e.colorGrading.hue,
			},
			posterization: {
				enabled: e.posterization.enabled,
				levels: e.posterization.levels,
				channelLevels: [...e.posterization.channelLevels],
				gamma: e.posterization.gamma,
				colorBanding: e.posterization.colorBanding,
			},
			bloom: {
				enabled: e.bloom.enabled,
				threshold: e.bloom.threshold,
				intensity: e.bloom.intensity,
				blur: e.bloom.blur,
			},
			dithering: {
				enabled: e.dithering.enabled,
				amount: e.dithering.amount,
				blend: e.dithering.blend,
				channelAmount: [...e.dithering.channelAmount],
			},
			crt: {
				enabled: e.crt.enabled,
				curvature: e.crt.curvature,
				scanlineIntensity: e.crt.scanlineIntensity,
			},
			pixelation: {
				enabled: e.pixelation.enabled,
				pixelSize: e.pixelation.pixelSize,
				shape: e.pixelation.shape,
				blend: e.pixelation.blend,
			},
			lensDistortion: {
				enabled: e.lensDistortion.enabled,
				strength: e.lensDistortion.strength,
				zoom: e.lensDistortion.zoom,
			},
			noise: {
				enabled: e.noise.enabled,
				amount: e.noise.amount,
			},
			chromaticAberration: {
				enabled: e.chromaticAberration.enabled,
				strength: e.chromaticAberration.strength,
				redOffset: e.chromaticAberration.redOffset,
				greenOffset: e.chromaticAberration.greenOffset,
				blueOffset: e.chromaticAberration.blueOffset,
				radialFalloff: e.chromaticAberration.radialFalloff,
				centerX: e.chromaticAberration.centerX,
				centerY: e.chromaticAberration.centerY,
			},
		};
	}

	/**
	 * Applies extras configuration from options to the viewer's effects.
	 */
	private applyExtrasOptions(extras: ExtrasOptions): void {
		const assign = <T>(target: T, source: Partial<T> | undefined) => {
			if (!source) return;
			for (const key of Object.keys(source) as (keyof T)[]) {
				if (source[key] !== undefined) {
					target[key] = source[key] as T[keyof T];
				}
			}
		};

		assign(this.extras.wireframe, extras.wireframe);
		assign(this.extras.gradientOutline, extras.gradientOutline);
		assign(this.extras.colorGrading, extras.colorGrading);
		assign(this.extras.posterization, extras.posterization);
		assign(this.extras.bloom, extras.bloom);
		assign(this.extras.dithering, extras.dithering);
		assign(this.extras.crt, extras.crt);
		assign(this.extras.pixelation, extras.pixelation);
		assign(this.extras.lensDistortion, extras.lensDistortion);
		assign(this.extras.noise, extras.noise);
		assign(this.extras.chromaticAberration, extras.chromaticAberration);
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
	 * Computes the camera mode omega offset for the current frame.
	 *
	 * When animation is playing, the cycle duration syncs to the animation
	 * duration so the camera completes exactly one full cycle per animation loop.
	 * Otherwise, {@link cameraModeSpeed} controls the cycle duration.
	 *
	 * @returns The omega offset in radians.
	 */
	private computeCameraModeOffset(): number {
		if (this.cameraMode === "fixed") return 0;

		const dir = this.cameraModeDirection === "right" ? 1 : -1;

		let time: number;
		let cycleDuration: number;

		if (this.animation.playing && this.model && this.model.motionDuration > 0) {
			time = this.animation.time;
			cycleDuration = this.model.motionDuration;
		} else {
			time = this.cameraModeTime;
			cycleDuration = this.cameraModeSpeed;
		}

		switch (this.cameraMode) {
			case "spin": {
				return (time / cycleDuration) * 2 * Math.PI * dir;
			}
			case "sway": {
				const r = time / cycleDuration;
				return -dir * Math.sin(r * 2 * Math.PI) * (Math.PI / 4);
			}
			case "pingpong": {
				let r = (time % cycleDuration) / cycleDuration;
				if (r > 0.5) r = 1 - r;
				return -dir * r * 2 * Math.PI;
			}
		}
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
			const panScale = this.camera.distanceToTarget * 0.002;

			this.camera.pan(mdx * panScale, mdy * panScale);
			this.pinchMidpoint = newMid;
		} else if (this.activePointers.size === 1) {
			if (e.pointerType === "touch" || this.dragButton === 0) {
				this.camera.rotate(-dx * 0.01, dy * 0.01);
				this.inertiaX = -dx * 0.01;
				this.inertiaY = dy * 0.01;
			} else if (this.dragButton === 1 || this.dragButton === 2) {
				const panScale = this.camera.distanceToTarget * 0.002;
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
