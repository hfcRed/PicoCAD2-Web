import { vec3 } from "gl-matrix";
import { evaluateMotions } from "./animation/animator.ts";
import { CAMERA_NEAR, OrbitCamera } from "./camera/orbit-camera.ts";
import { FISHEYE_STRENGTH, GLOBAL_W } from "./camera/projection.ts";
import { PicoCAD2Context } from "./context.ts";
import { parseModel, parseSource } from "./parser/parser.ts";
import { packColorMask } from "./rendering/effects/color-mask.ts";
import {
	assignSettings,
	type DeepPartial,
	deepFreeze,
	diffFromDefaults,
	mergeDefaults,
} from "./rendering/effects/effect-defaults.ts";
import type { TransparencyMode } from "./rendering/effects/material-style.ts";
import { PostProcessPipeline } from "./rendering/effects/pipeline.ts";
import type { ModelResources, RenderSettings } from "./rendering/renderer.ts";
import { collectRayCrossings } from "./scene/raycast.ts";
import {
	restoreStaticTransforms,
	storeStaticTransforms,
	traverseNode,
} from "./scene/scene-graph.ts";
import type { RawPicoCAD2File } from "./types/model.ts";
import type {
	BookmarkSettings,
	CameraControlOptions,
	CameraDistanceClamp,
	ColorScheme,
	ExtrasOptions,
	ModelInfo,
	ModelSettings,
	PicoCAD2ViewerOptions,
	PicoCAD2ViewerState,
	ResolvedColorScheme,
	ViewerSettings,
} from "./types/options.ts";
import type {
	CameraBookmark,
	CameraMode,
	CameraState,
	Color3,
	PicoCAD2Model,
	ProjectionMode,
	SceneNode,
} from "./types/scene.ts";
import { EXTRAS_DEFAULTS, ViewerExtras } from "./viewer-extras.ts";
import {
	bookmarkSettingsOf,
	getDefaultModelSettings,
	getDefaultViewerSettings,
	MODEL_SETTINGS_DEFAULTS,
	modelSettingsOf,
	RENDER_MODE,
	SHADING_MODE,
	VIEWER_SETTINGS_DEFAULTS,
} from "./viewer-settings.ts";

export interface ViewerTag {
	text: string;
	color?: Color3;
}

/**
 * Ray crossings closer together than this are treated as the same wall for
 * the camera surface clamp, so paired opposing single-sided faces behave
 * like one two-sided wall.
 */
const COPLANAR_EPSILON = 1e-4;

/**
 * Copies a tag, filling in the white a missing color renders as so a state
 * always records the color it shows.
 */
function copyTag(tag: ViewerTag | null): ViewerTag | null {
	if (!tag) return null;
	return { text: tag.text, color: [...(tag.color ?? [1, 1, 1])] };
}

/**
 * Converts stored camera settings into the model's camera state shape.
 */
function toCameraState(settings: BookmarkSettings): CameraState {
	return {
		omega: settings.omega,
		theta: settings.theta,
		distanceToTarget: settings.distanceToTarget,
		target: new Float32Array(settings.target),
	};
}

/** Controls animation playback state and timing, as `viewer.animation`. */
export class AnimationController {
	private duration = 0;

	playing = false;
	speed = 1;
	time = 0;
	loop = true;
	loops = 1;

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

	shadingMode: number = MODEL_SETTINGS_DEFAULTS.shadingMode;
	renderMode: number = MODEL_SETTINGS_DEFAULTS.renderMode;
	projectionMode: ProjectionMode = MODEL_SETTINGS_DEFAULTS.projectionMode;
	backgroundColor: Color3 | null = null;
	outlineSize = MODEL_SETTINGS_DEFAULTS.outlineSize;
	outlineColor: Color3 = [...MODEL_SETTINGS_DEFAULTS.outlineColor];
	scanlines = MODEL_SETTINGS_DEFAULTS.scanlines;
	scanlineColor: Color3 = [...MODEL_SETTINGS_DEFAULTS.scanlineColor];
	leftTag: ViewerTag | null = null;
	rightTag: ViewerTag | null = null;
	cameraMode: CameraMode = MODEL_SETTINGS_DEFAULTS.cameraMode;
	cameraModeSpeed = MODEL_SETTINGS_DEFAULTS.cameraModeSpeed;
	cameraModeDirection: "left" | "right" =
		MODEL_SETTINGS_DEFAULTS.cameraModeDirection;
	maxFps = VIEWER_SETTINGS_DEFAULTS.maxFps;
	clampCameraDistance: CameraDistanceClamp = {
		...VIEWER_SETTINGS_DEFAULTS.clampCameraDistance,
	};
	transparency: TransparencyMode = VIEWER_SETTINGS_DEFAULTS.transparency;
	colorScheme: ColorScheme = VIEWER_SETTINGS_DEFAULTS.colorScheme;
	onLoad: ((info: ModelInfo) => void) | null = null;
	onFrame: ((dt: number) => void) | null = null;
	onDispose: (() => void) | null = null;

	private context: PicoCAD2Context;
	private ownsContext: boolean;
	private ctx2d: CanvasRenderingContext2D;
	private source: PicoCAD2ViewerState["source"] = null;
	private model: PicoCAD2Model | null = null;
	private resources: ModelResources | null = null;
	private renderWidth = 128;
	private renderHeight = 128;
	private renderScale = 1;
	private renderLoopActive = false;
	private loopSyncWithAnimation = true;
	private lastFrameTime = 0;
	private lastDt = 0;
	private elapsedTime = 0;
	private cameraControlsEnabled = false;
	private cameraControlZoom = true;
	private cameraControlPan = true;
	private cameraControlRotate = true;
	private spinInertiaFactor = 0.92;
	private fixedOnInteract: CameraControlOptions["useFixedOnInteract"] | null =
		null;
	private fixedOnInteractTimer: ReturnType<typeof setTimeout> | null = null;
	private savedCameraMode: CameraMode | null = null;
	private absorbedOmegaOffset = 0;
	private _loadedWithBookmark = false;
	private dragButton = 0;
	private activePointers: Map<number, { x: number; y: number }> = new Map();
	private pinchStartDist = 0;
	private pinchMidpoint: { x: number; y: number } = { x: 0, y: 0 };
	private cameraModeTime = 0;
	private frameSyncWithAnimation = true;
	private wasAnimating = false;
	private clampBaseline: number | null = null;
	private _modelInfo: ModelInfo | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private resizeScale = 1;
	private readonly darkSchemeQuery: MediaQueryList | null =
		typeof matchMedia === "function"
			? matchMedia("(prefers-color-scheme: dark)")
			: null;
	private inertiaActive = false;
	private inertiaX = 0;
	private inertiaY = 0;
	private readonly _extras: ViewerExtras;

	private readonly pipeline: PostProcessPipeline = new PostProcessPipeline();

	private readonly renderSettings: RenderSettings = {
		shading: true,
		renderMode: 0,
		backgroundColor: null,
		transparency: "dithered",
		colorScheme: "light",
		outlineSize: 0,
		outlineColor: [0, 0, 0],
		cutoutMask: 0,
		colorCutout: null,
		dissolve: null,
		emission: null,
		projection: null,
		display: null,
		interior: null,
		rimLight: null,
		gradientLight: null,
		specular: null,
		glitter: null,
		meshDeform: null,
		triangleFlash: null,
		triangleShatter: null,
		vertexGlitch: null,
		paletteSwap: null,
		fur: null,
		billboard: null,
		floor: null,
	};

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

		this._extras = new ViewerExtras(this.pipeline);

		const resolution = options?.resolution;
		if (resolution) {
			this.setResolution(resolution.width, resolution.height, resolution.scale);
		}

		if (options?.backgroundColor !== undefined)
			this.backgroundColor = options.backgroundColor;
		if (options?.animationSpeed !== undefined) {
			this.animation.speed = options.animationSpeed;
		}
		if (options?.maxFps !== undefined) this.maxFps = options.maxFps;
		if (options?.clampCameraDistance) {
			this.clampCameraDistance = {
				enabled: options.clampCameraDistance.enabled ?? false,
				minimumDistance: options.clampCameraDistance.minimumDistance ?? 0,
			};
		}
		if (options?.transparency) this.transparency = options.transparency;
		if (options?.colorScheme) this.colorScheme = options.colorScheme;

		if (options?.extras) {
			this.applyExtrasOptions(options.extras);
		}

		if (options?.onLoad !== undefined) this.onLoad = options.onLoad;
		if (options?.onFrame !== undefined) this.onFrame = options.onFrame;
		if (options?.onDispose !== undefined) this.onDispose = options.onDispose;

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
	 * The viewer's extras (post-process effects).
	 */
	get extras(): ViewerExtras {
		return this._extras;
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
	 * Information about the currently loaded model, or null if no model is loaded.
	 */
	get modelInfo(): ModelInfo | null {
		if (!this._modelInfo || !this.model) return this._modelInfo;

		const texture = this.model.texture;
		const bgIdx = texture.backgroundColor;
		const colors = texture.sourceColors;

		return {
			...this._modelInfo,
			backgroundColor: this.backgroundColor
				? [...this.backgroundColor]
				: [
						colors[bgIdx * 3] ?? 0,
						colors[bgIdx * 3 + 1] ?? 0,
						colors[bgIdx * 3 + 2] ?? 0,
					],
		};
	}

	/**
	 * Loads a PicoCAD 2 model from a JSON string.
	 *
	 * @param source - The raw JSON string content of the model file.
	 * @param useBookmark - If true, initializes the camera from the model's bookmark instead of the default camera state.
	 */
	load(source: string, useBookmark = false): void {
		this.loadModel(parseSource(source), useBookmark);
		this.emitLoad();
	}

	/**
	 * Replaces the current model with a parsed file and applies the file's
	 * settings, the same way a state's model group is applied. The file is
	 * parsed before the previous model's resources go, so a file that fails
	 * to parse leaves the viewer as it was. The load callback is left to the
	 * caller, so a state restore can fire it once everything is applied.
	 *
	 * @param raw - The raw file object, frozen unless the caller owns it.
	 * @param useBookmark - Whether the camera starts from the model's bookmark.
	 */
	private loadModel(
		raw: NonNullable<PicoCAD2ViewerState["source"]>,
		useBookmark: boolean,
	): void {
		const model = parseModel(raw as RawPicoCAD2File);
		this._loadedWithBookmark = useBookmark;
		this.cancelCameraModeRestore();

		if (this.resources) {
			this.context.disposeModelResources(this.resources);
			this.resources = null;
		}

		if (!Object.isFrozen(raw)) deepFreeze(raw);
		this.source = raw;
		this.model = model;
		this.resources = this.context.createModelResources(model);
		this.animation.setDuration(model.motionDuration);

		this._modelInfo = this.computeModelInfo(model);
		this.applyModelSettings(this._modelInfo.settings, useBookmark);

		storeStaticTransforms(model.root);
		this.wasAnimating = false;
		this.clampBaseline = null;
	}

	/**
	 * Fires the load callback with the loaded model's info.
	 */
	private emitLoad(): void {
		if (this._modelInfo) this.onLoad?.(this._modelInfo);
	}

	/**
	 * Loads a PicoCAD 2 model from a File object.
	 *
	 * @param file - The file to read.
	 * @param useBookmark - If true, initializes the camera from the model's bookmark instead of the default camera state.
	 */
	async loadFromFile(file: File, useBookmark = false): Promise<void> {
		const text = await file.text();
		this.load(text, useBookmark);
	}

	/**
	 * Resets the camera to the bookmarked state, if a bookmark exists.
	 *
	 * @returns True if the bookmark was applied, false if no bookmark exists.
	 */
	useBookmark(): boolean {
		if (!this.model?.bookmark) return false;
		this.camera.initFromState(this.model.bookmark);
		return true;
	}

	/**
	 * Updates the bookmark with the given camera state.
	 *
	 * @param bookmark - The camera state to store as the bookmark.
	 */
	setBookmark(bookmark: CameraBookmark): void {
		if (!this.model) return;
		this.model.bookmark = bookmark;
	}

	/**
	 * Draws a single frame.
	 *
	 * @param syncWithAnimation - When `true` (default), camera mode offset
	 *   syncs to animation playback. When `false`, uses {@link cameraModeSpeed}.
	 */
	draw(syncWithAnimation = true): void {
		if (!this.model || !this.resources) return;

		this.prepareFrame(syncWithAnimation);

		this.context.render(
			this.camera,
			this.renderSettings,
			this.model,
			this.resources,
			this.renderWidth,
			this.renderHeight,
			this.elapsedTime,
			this.pipeline,
		);

		// Use transferToImageBitmap to atomically capture the WebGL drawing buffer.
		// Direct drawImage from a shared WebGL OffscreenCanvas can read stale content
		// when multiple viewers render in sequence within the same frame.
		const bitmap = this.context.canvas.transferToImageBitmap();
		this.present(bitmap, 0, 0);
		bitmap.close();
	}

	/**
	 * Resolves once every shader program the current settings need has
	 * compiled. Programs compile in the background on contexts that allow
	 * it, and until they are ready `draw()` stands in with the programs it
	 * has, so an effect appears a few frames after it was enabled. Await
	 * this to draw a frame that shows every enabled effect, for example
	 * before an export.
	 */
	async whenReady(): Promise<void> {
		if (this.model) {
			this.prepareFrame(this.loopSyncWithAnimation);
			this.context._requestPrograms(this.renderSettings, this.pipeline);
		}
		await this.context.whenShadersReady();
	}

	/**
	 * Updates the camera and animation pose and fills the render settings
	 * for the current frame.
	 *
	 * @param syncWithAnimation - When `true` (default), camera mode offset
	 *   syncs to animation playback. When `false`, uses {@link cameraModeSpeed}.
	 */
	private prepareFrame(syncWithAnimation: boolean): void {
		if (!this.model) return;

		this.frameSyncWithAnimation = syncWithAnimation;
		this.camera.projectionMode = this.projectionMode;
		this.camera.omegaOffset = this.computeCameraModeOffset(syncWithAnimation);

		if (this.animation.playing || this.animation.time > 0) {
			restoreStaticTransforms(this.model.root);
			evaluateMotions(this.model.root, this.animation.time);
			this.wasAnimating = true;
		} else if (this.wasAnimating) {
			restoreStaticTransforms(this.model.root);
			this.wasAnimating = false;
		}

		const settings = this.renderSettings;
		settings.shading = this.shadingMode > SHADING_MODE.off;
		settings.renderMode =
			this.renderMode === RENDER_MODE.none
				? 2
				: this.renderMode === RENDER_MODE.color
					? 1
					: 0;
		settings.backgroundColor = this.backgroundColor;
		settings.transparency = this.transparency;
		settings.colorScheme = this.resolveColorScheme();
		settings.outlineSize = this.outlineSize;
		settings.outlineColor = this.outlineColor;

		const cutout = this._extras.colorCutout;
		settings.cutoutMask = cutout.enabled
			? packColorMask(cutout.maskedColors)
			: 0;
		settings.colorCutout = cutout;

		settings.dissolve = this._extras.dissolve;
		settings.emission = this._extras.emission;
		settings.projection = this._extras.projection;
		settings.display = this._extras.display;
		settings.interior = this._extras.interior;
		settings.rimLight = this._extras.rimLight;
		settings.gradientLight = this._extras.gradientLight;
		settings.specular = this._extras.specular;
		settings.glitter = this._extras.glitter;
		settings.meshDeform = this._extras.meshDeform;
		settings.triangleFlash = this._extras.triangleFlash;
		settings.triangleShatter = this._extras.triangleShatter;
		settings.vertexGlitch = this._extras.vertexGlitch;
		settings.paletteSwap = this._extras.paletteSwap;
		settings.fur = this._extras.fur;
		settings.billboard = this._extras.billboard;
		settings.floor = this._extras.floor;

		if (this.clampCameraDistance.enabled && this.model) {
			this.clampCameraToSurfaces(this.model.root);
		} else {
			this.clampBaseline = null;
		}
	}

	/**
	 * Keeps the camera outside the model's surfaces by zooming out, no
	 * matter what moved it inside. Only the distance to target is adjusted,
	 * never the target or the orbit angles.
	 *
	 * Double-sided faces are treated as membranes and block the zoom-in sweep
	 * like any visible surface, but carry no volume information, so the
	 * enclosure walk ignores them.
	 *
	 * Enforcement pauses while the camera interpolates to a state so
	 * restores can complete; the landing position is enforced normally.
	 *
	 * @param root - The model's scene graph root.
	 */
	private clampCameraToSurfaces(root: SceneNode): void {
		const camera = this.camera;
		if (camera.isInterpolating) {
			this.clampBaseline = null;
			return;
		}

		// Unit direction from the target to the camera
		const omega = camera.omega + camera.omegaOffset;
		const cosTheta = Math.cos(camera.theta);
		const dir = vec3.fromValues(
			Math.cos(omega) * cosTheta,
			Math.sin(camera.theta),
			Math.sin(omega) * cosTheta,
		);

		const crossings = collectRayCrossings(root, camera.target, dir);
		if (crossings.length === 0) {
			this.clampBaseline = camera.distanceToTarget;
			return;
		}

		const margin = Math.max(
			this.clampCameraDistance.minimumDistance,
			this.nearPlaneClearance(),
		);
		const baseline = this.clampBaseline;
		let distance = camera.distanceToTarget;

		// Anti-tunnel sweep over the segment the camera moved this frame.
		if (baseline !== null && distance < baseline) {
			for (const crossing of crossings) {
				if (crossing.t > baseline) break;
				if (!crossing.enclosing && !crossing.membrane) continue;
				if (crossing.t + margin > distance) {
					distance = crossing.t + margin;
				}
			}
		}

		// Enclosure walk outward from the camera. Membranes carry no
		// volume information, so they neither push nor shield here.
		for (let i = 0; i < crossings.length; i++) {
			const crossing = crossings[i];
			if (crossing.membrane) continue;
			if (crossing.t + margin <= distance) continue;
			if (!crossing.enclosing) break;

			// A camera-facing face coplanar with this one makes it a
			// two-sided wall, not a solid so it shields instead of pushing.
			let shielded = false;
			for (
				let j = i + 1;
				j < crossings.length && crossings[j].t - crossing.t < COPLANAR_EPSILON;
				j++
			) {
				if (!crossings[j].enclosing && !crossings[j].membrane) {
					shielded = true;
					break;
				}
			}
			if (shielded) break;

			distance = crossing.t + margin;
		}

		if (distance > camera.distanceToTarget) {
			camera.zoomBy(distance - camera.distanceToTarget);
		}
		this.clampBaseline = camera.distanceToTarget;
	}

	/**
	 * How much room the camera needs in front of a surface so no part of
	 * the near plane can poke through it. The Euclidean distance from the
	 * camera to the near plane's corners under the current projection, plus
	 * a small safety factor for oblique surfaces.
	 */
	private nearPlaneClearance(): number {
		const zoom = Math.max(
			this.camera.zoom *
				(this.projectionMode === "fisheye" ? FISHEYE_STRENGTH : 1),
			0.05,
		);
		const tanV = GLOBAL_W / zoom;
		const tanH = (tanV * this.renderWidth) / this.renderHeight;
		return CAMERA_NEAR * Math.sqrt(1 + tanV * tanV + tanH * tanH) * 1.2;
	}

	/**
	 * Draws the viewer's region of a captured frame to its canvas and
	 * applies the 2D overlays (scanlines, tags).
	 *
	 * @param bitmap - The captured frame.
	 * @param sx - The source x position of this viewer's region in the bitmap.
	 * @param sy - The source y position of this viewer's region in the bitmap.
	 */
	private present(bitmap: ImageBitmap, sx: number, sy: number): void {
		const w = this.renderWidth;
		const h = this.renderHeight;
		const s = this.renderScale;
		const dw = w * s;
		const dh = h * s;

		this.ctx2d.clearRect(0, 0, dw, dh);
		this.ctx2d.drawImage(bitmap, sx, sy, w, h, 0, 0, dw, dh);

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
	 * Advances the viewer's internal clock by the given delta.
	 * Call this before `draw()` in a custom render loop to keep
	 * shader effects (glitch, noise, etc.) animating.
	 *
	 * When `startRenderLoop()` is used, this is called automatically each frame.
	 *
	 * @param dt - The time delta in seconds to advance the clock by.
	 */
	advanceTime(dt: number): void {
		this.elapsedTime += dt;
		this.animation.advance(dt);
		this.cameraModeTime += dt;
	}

	/**
	 * Starts the render loop.
	 *
	 * All viewers sharing this viewer's context render together in a single
	 * shared loop with one drawing buffer capture per frame. Each viewer is
	 * drawn at most {@link maxFps} times per second; on displays with a
	 * higher refresh rate the loop skips animation frames until enough time
	 * has passed, so animation speed is unaffected by the cap.
	 *
	 * @param syncWithAnimation - When `true` (default), camera mode offset
	 *   syncs to animation playback. When `false`, uses {@link cameraModeSpeed}.
	 */
	startRenderLoop(syncWithAnimation = true): void {
		if (this.renderLoopActive) return;
		this.renderLoopActive = true;
		this.loopSyncWithAnimation = syncWithAnimation;
		this.lastFrameTime = performance.now();
		this.context._register(this);
	}

	/**
	 * Stops the render loop.
	 */
	stopRenderLoop(): void {
		if (!this.renderLoopActive) return;
		this.renderLoopActive = false;
		this.context._unregister(this);
	}

	/**
	 * The viewer's render width, for the shared render loop's atlas layout.
	 *
	 * @internal
	 */
	get _renderWidth(): number {
		return this.renderWidth;
	}

	/**
	 * The viewer's render height, for the shared render loop's atlas layout.
	 *
	 * @internal
	 */
	get _renderHeight(): number {
		return this.renderHeight;
	}

	/**
	 * Advances this viewer's frame timing. Returns whether a new frame is
	 * due under the {@link maxFps} cap; when it is, the clock and inertia
	 * have been advanced by the elapsed time since the last drawn frame.
	 *
	 * @internal
	 */
	_tick(now: number): boolean {
		const interval = this.maxFps > 0 ? 1000 / this.maxFps : 0;
		const elapsed = now - this.lastFrameTime;
		if (elapsed < interval) return false;

		// Keep the remainder so the effective rate doesn't drift below
		// maxFps when the display refresh doesn't divide it evenly.
		this.lastFrameTime = interval > 0 ? now - (elapsed % interval) : now;

		this.lastDt = elapsed / 1000;
		this.advanceTime(this.lastDt);
		this.applyInertia();
		return true;
	}

	/**
	 * Renders this viewer's scene into its atlas region. Returns false if
	 * no model is loaded and nothing was rendered.
	 *
	 * @internal
	 */
	_renderToAtlas(x: number, y: number): boolean {
		if (!this.model || !this.resources) return false;

		this.prepareFrame(this.loopSyncWithAnimation);
		this.context._renderAt(
			this.camera,
			this.renderSettings,
			this.model,
			this.resources,
			x,
			y,
			this.renderWidth,
			this.renderHeight,
			this.elapsedTime,
			this.pipeline,
		);
		return true;
	}

	/**
	 * Presents this viewer's region of the captured atlas frame.
	 *
	 * @internal
	 */
	_presentFromAtlas(bitmap: ImageBitmap, sx: number, sy: number): void {
		this.present(bitmap, sx, sy);
	}

	/**
	 * Fires the per-frame callback after the shared loop finishes a frame.
	 *
	 * @internal
	 */
	_emitFrame(): void {
		this.onFrame?.(this.lastDt);
	}

	/**
	 * Enables mouse/touch camera controls on the canvas.
	 *
	 * @param options - Optional object to enable specific controls. All default to true.
	 */
	enableCameraControls(options?: CameraControlOptions): void {
		this.cameraControlZoom = options?.zoom ?? true;
		this.cameraControlPan = options?.pan ?? true;
		this.cameraControlRotate = options?.rotate ?? true;
		this.spinInertiaFactor = Math.max(
			0,
			Math.min(1, options?.spinInertiaFactor ?? 0.92),
		);
		this.fixedOnInteract = options?.useFixedOnInteract ?? null;

		if (!this.fixedOnInteract?.enabled) {
			this.restoreCameraMode(null);
		}

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
		this.canvas.addEventListener(
			"pointercancel",
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
		this.restoreCameraMode(null);

		this.activePointers.clear();
		this.inertiaActive = false;
		this.pinchStartDist = 0;

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
		this.canvas.removeEventListener(
			"pointercancel",
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
		const w = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
		const h = Number.isFinite(height) ? Math.max(1, Math.floor(height)) : 1;
		const s = Number.isFinite(scale) && scale > 0 ? scale : 1;

		this.renderWidth = w;
		this.renderHeight = h;
		this.renderScale = s;
		this.canvas.width = w * s;
		this.canvas.height = h * s;
		this.ctx2d.imageSmoothingEnabled = false;
		this.canvas.style.width = `${w * s}px`;
		this.canvas.style.height = `${h * s}px`;
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
	 * Returns the raw pixel data of the last rendered frame as a `Uint8Array`.
	 *
	 * Each pixel is represented as four consecutive bytes (R, G, B, A).
	 * The total length of the array is `width * height * 4`.
	 *
	 * @returns The raw RGBA pixel data.
	 */
	toPixelData(): Uint8Array {
		const width = this.canvas.width;
		const height = this.canvas.height;
		const imageData = this.ctx2d.getImageData(0, 0, width, height);

		return new Uint8Array(imageData.data.buffer);
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
		this.onDispose?.();
		this.stopRenderLoop();
		this.disableCameraControls();
		this.unwatchResize();

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
		this._modelInfo = null;
	}

	/**
	 * Returns a JSON-serializable snapshot of the viewer's state: the raw
	 * model source, the model settings that differ from what the file says,
	 * the viewer settings that differ from their defaults, and the effect
	 * settings that differ from theirs.
	 */
	getState(): PicoCAD2ViewerState {
		const fileSettings = this._modelInfo?.settings ?? MODEL_SETTINGS_DEFAULTS;
		return {
			source: this.source,
			model: (diffFromDefaults(fileSettings, this.readModelSettings()) ??
				{}) as DeepPartial<ModelSettings>,
			viewer: (diffFromDefaults(
				VIEWER_SETTINGS_DEFAULTS,
				this.readViewerSettings(),
			) ?? {}) as DeepPartial<ViewerSettings>,
			extras: this.getExtrasState(),
		};
	}

	/**
	 * Restores the viewer from a previously captured state. The source is
	 * loaded, then the state's model settings are laid over the file's, its
	 * viewer settings over the defaults and its effects over theirs, so a
	 * state only needs what differs from a plain load of the source.
	 *
	 * @param state - The state to restore.
	 * @param useBookmark - If true, initializes the camera from the model's bookmark instead of the default camera state.
	 */
	setState(state: PicoCAD2ViewerState, useBookmark = false): void {
		if (!state.source) return;

		const raw = Object.isFrozen(state.source)
			? state.source
			: structuredClone(state.source);
		this.loadModel(raw, useBookmark);
		if (!this.model || !this._modelInfo) return;

		this.applyModelSettings(
			mergeDefaults(this._modelInfo.settings, state.model),
			useBookmark,
		);
		this.applyViewerSettings(
			mergeDefaults(getDefaultViewerSettings(), state.viewer),
		);

		// A state lists only the effects it uses, so every other effect
		// returns to its defaults.
		this._extras.reset();
		this.applyExtrasOptions(state.extras ?? {});
		this.emitLoad();
	}

	/**
	 * Reads the complete current model settings.
	 */
	private readModelSettings(): ModelSettings {
		const paused = this.savedCameraMode !== null;

		return {
			shadingMode: this.shadingMode,
			renderMode: this.renderMode,
			projectionMode: this.projectionMode,
			outlineSize: this.outlineSize,
			outlineColor: [...this.outlineColor],
			scanlines: this.scanlines,
			scanlineColor: [...this.scanlineColor],
			cameraMode: this.savedCameraMode ?? this.cameraMode,
			cameraModeSpeed: this.cameraModeSpeed,
			cameraModeDirection: this.cameraModeDirection,
			leftTag: copyTag(this.leftTag),
			rightTag: copyTag(this.rightTag),
			animation: {
				time: this.animation.time,
				playing: this.animation.playing,
				loops: this.animation.loops,
			},
			camera: {
				omega: this.camera.omega - (paused ? this.absorbedOmegaOffset : 0),
				theta: this.camera.theta,
				distanceToTarget: this.camera.distanceToTarget,
				target: [
					this.camera.target[0],
					this.camera.target[1],
					this.camera.target[2],
				],
				zoom: this.camera.zoom,
			},
			bookmark: this.model
				? bookmarkSettingsOf(this.model.bookmark)
				: getDefaultModelSettings().bookmark,
		};
	}

	/**
	 * Reads the complete current viewer settings.
	 */
	private readViewerSettings(): ViewerSettings {
		return {
			backgroundColor: this.backgroundColor ? [...this.backgroundColor] : null,
			resolution: {
				width: this.renderWidth,
				height: this.renderHeight,
				scale: this.renderScale,
			},
			maxFps: this.maxFps,
			clampCameraDistance: { ...this.clampCameraDistance },
			animationSpeed: this.animation.speed,
			animationLoop: this.animation.loop,
			transparency: this.transparency,
			colorScheme: this.colorScheme,
		};
	}

	/**
	 * Resolves the {@link colorScheme} to the scheme the frame renders for,
	 * following the browser's `prefers-color-scheme` while it is `"auto"`.
	 * Without `matchMedia`, `"auto"` renders light.
	 */
	resolveColorScheme(): ResolvedColorScheme {
		if (this.colorScheme !== "auto") return this.colorScheme;
		return this.darkSchemeQuery?.matches ? "dark" : "light";
	}

	/**
	 * Applies complete model settings to a loaded model. The camera and
	 * bookmark are written onto the model, so the camera restoration after
	 * an interaction returns to them instead of the file's.
	 */
	private applyModelSettings(s: ModelSettings, useBookmark: boolean): void {
		if (!this.model) return;

		this.shadingMode = s.shadingMode;
		this.renderMode = s.renderMode;
		this.projectionMode = s.projectionMode;
		this.outlineSize = s.outlineSize;
		this.outlineColor = [...s.outlineColor];
		this.scanlines = s.scanlines;
		this.scanlineColor = [...s.scanlineColor];
		this.cameraMode = s.cameraMode;
		this.cameraModeSpeed = s.cameraModeSpeed;
		this.cameraModeDirection = s.cameraModeDirection;
		this.leftTag = copyTag(s.leftTag);
		this.rightTag = copyTag(s.rightTag);

		this.animation.time = s.animation.time;
		this.animation.loops = s.animation.loops;
		if (s.animation.playing) {
			this.animation.play();
		} else {
			this.animation.pause();
		}

		this.model.camera = toCameraState(s.camera);
		this.model.bookmark = toCameraState(s.bookmark);
		this.camera.initFromState(
			useBookmark ? this.model.bookmark : this.model.camera,
		);
		this.camera.zoom = s.camera.zoom;
	}

	/**
	 * Applies complete viewer settings.
	 */
	private applyViewerSettings(s: ViewerSettings): void {
		this.backgroundColor = s.backgroundColor ? [...s.backgroundColor] : null;
		this.setResolution(
			s.resolution.width,
			s.resolution.height,
			s.resolution.scale,
		);
		this.maxFps = s.maxFps;
		this.clampCameraDistance = { ...s.clampCameraDistance };
		this.animation.speed = s.animationSpeed;
		this.animation.loop = s.animationLoop;
		this.transparency = s.transparency;
		this.colorScheme = s.colorScheme;
	}

	/**
	 * Reads the effect settings that differ from {@link EXTRAS_DEFAULTS}
	 * into a plain object, so a state carries only the effects in use.
	 */
	private getExtrasState(): ExtrasOptions {
		return (diffFromDefaults(EXTRAS_DEFAULTS, this.extras) ??
			{}) as ExtrasOptions;
	}

	/**
	 * Lays effect options over the viewer's effects, following the shape of
	 * {@link EXTRAS_DEFAULTS}. Nested groups merge, arrays are copied, and
	 * keys the effects do not know are ignored.
	 */
	private applyExtrasOptions(extras: ExtrasOptions): void {
		for (const key of Object.keys(
			EXTRAS_DEFAULTS,
		) as (keyof typeof EXTRAS_DEFAULTS)[]) {
			const options = extras[key];
			if (!options) continue;
			assignSettings(this.extras[key], options, EXTRAS_DEFAULTS[key]);
		}
	}

	/**
	 * Computes model metadata from a parsed model.
	 */
	private computeModelInfo(model: PicoCAD2Model): ModelInfo {
		let nodeCount = 0;
		let polyCount = 0;
		traverseNode(model.root, (node) => {
			nodeCount++;
			if (node.mesh) {
				polyCount += node.mesh.faces.length;
			}
		});

		const texture = model.texture;
		const bgIdx = texture.backgroundColor;
		const colors = texture.sourceColors;

		const palette: Color3[] = [];
		for (let i = 0; i < colors.length; i += 3) {
			palette.push([colors[i], colors[i + 1], colors[i + 2]]);
		}

		return {
			nodeCount,
			polyCount,
			animationDuration: model.motionDuration,
			hasAnimation: model.motionDuration > 0,
			backgroundColor: [
				colors[bgIdx * 3] ?? 0,
				colors[bgIdx * 3 + 1] ?? 0,
				colors[bgIdx * 3 + 2] ?? 0,
			],
			transparentColor: [
				colors[texture.transparentColor * 3] ?? 0,
				colors[texture.transparentColor * 3 + 1] ?? 0,
				colors[texture.transparentColor * 3 + 2] ?? 0,
			],
			palette,
			settings: modelSettingsOf(model),
		};
	}

	/**
	 * Applies inertia decay to the camera after a drag gesture ends.
	 */
	private applyInertia(): void {
		if (!this.inertiaActive) return;

		const decay = this.spinInertiaFactor;
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
	 * When `syncWithAnimation` is `true` and animation is playing, the cycle
	 * duration syncs to the animation duration so the camera completes exactly
	 * one full cycle per animation loop. Otherwise, {@link cameraModeSpeed}
	 * controls the cycle duration.
	 *
	 * @param syncWithAnimation - Whether to sync with animation playback.
	 * @returns The omega offset in radians.
	 */
	private computeCameraModeOffset(syncWithAnimation = true): number {
		if (this.cameraMode === "fixed") return 0;

		const dir = this.cameraModeDirection === "right" ? 1 : -1;

		let time: number;
		let cycleDuration: number;

		if (
			syncWithAnimation &&
			this.animation.playing &&
			this.model &&
			this.model.motionDuration > 0
		) {
			time = this.animation.time;
			cycleDuration = this.model.motionDuration;
		} else {
			time = this.cameraModeTime;
			cycleDuration = this.cameraModeSpeed;
		}

		if (!(cycleDuration > 0)) return 0;

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
	 * Called on any camera interaction. When useFixedOnInteract is enabled,
	 * switches to "fixed" mode and schedules a restore after the delay.
	 */
	private onCameraInteraction(): void {
		if (!this.fixedOnInteract?.enabled) return;
		this.camera.cancelLerp();

		if (this.savedCameraMode === null) {
			this.savedCameraMode = this.cameraMode;
			// Absorb the current omegaOffset into omega so switching to "fixed"
			// (which returns offset 0) doesn't cause a visual jump. The amount
			// is kept so a state read meanwhile records the unabsorbed omega.
			this.absorbedOmegaOffset = this.camera.omegaOffset;
			this.camera.omega += this.camera.omegaOffset;
			this.camera.omegaOffset = 0;
		}
		this.cameraMode = "fixed";

		this.scheduleCameraModeRestore();
	}

	/**
	 * Debounces restoring the camera mode after a useFixedOnInteract switch.
	 * While a pointer is still held down the restore keeps deferring, so the
	 * delay effectively counts from the last release. The options are
	 * captured, so a later change to the controls cannot pull them out from
	 * under the timer.
	 */
	private scheduleCameraModeRestore(): void {
		const options = this.fixedOnInteract;
		if (!options?.enabled) return;
		this.clearCameraModeRestoreTimer();

		this.fixedOnInteractTimer = setTimeout(() => {
			this.fixedOnInteractTimer = null;

			if (this.activePointers.size > 0) {
				this.scheduleCameraModeRestore();
				return;
			}

			this.restoreCameraMode(options.restoreTime);
		}, options.delayBeforeRestore);
	}

	/**
	 * Returns the camera mode a useFixedOnInteract pause parked. The offset
	 * the restored mode will produce next frame is absorbed out of omega so
	 * there is no jump when the mode starts driving omegaOffset again. It
	 * has to come from the clock the frames use: the animation clock and the
	 * camera mode clock drift apart the moment the animation is seeked,
	 * paused or restored from a state, and the difference between the two
	 * offsets would show as a jump.
	 *
	 * @param restoreTime - Milliseconds to interpolate the camera back to
	 *   the model's camera state over, or null to leave the camera where it is.
	 */
	private restoreCameraMode(restoreTime: number | null): void {
		this.clearCameraModeRestoreTimer();
		if (this.savedCameraMode === null) return;

		this.inertiaActive = false;
		this.cameraMode = this.savedCameraMode;
		this.savedCameraMode = null;
		const incomingOffset = this.computeCameraModeOffset(
			this.frameSyncWithAnimation,
		);
		this.camera.omega -= incomingOffset;
		this.camera.omegaOffset = incomingOffset;

		if (restoreTime === null) return;
		const state =
			this._loadedWithBookmark && this.model?.bookmark
				? this.model.bookmark
				: this.model?.camera;
		if (state) {
			this.camera.initFromState(state, restoreTime);
		}
	}

	/**
	 * Drops a pending useFixedOnInteract pause without restoring anything,
	 * for when the model changes under it.
	 */
	private cancelCameraModeRestore(): void {
		this.clearCameraModeRestoreTimer();
		this.savedCameraMode = null;
	}

	/**
	 * Stops the pending restore timer, if any.
	 */
	private clearCameraModeRestoreTimer(): void {
		if (this.fixedOnInteractTimer === null) return;
		clearTimeout(this.fixedOnInteractTimer);
		this.fixedOnInteractTimer = null;
	}

	/**
	 * Handles pointer down events.
	 *
	 * @param e - The pointer event.
	 */
	private onPointerDown(e: PointerEvent): void {
		this.onCameraInteraction();
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

		this.onCameraInteraction();

		const dx = e.clientX - prev.x;
		const dy = e.clientY - prev.y;
		this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (this.activePointers.size === 2) {
			if (this.cameraControlZoom) {
				const newDist = this.getPointerDistance();
				if (this.pinchStartDist > 0) {
					const delta = this.pinchStartDist - newDist;
					this.camera.zoomBy(delta * 0.1);
				}
				this.pinchStartDist = newDist;
			}

			if (this.cameraControlPan) {
				const newMid = this.getPointerMidpoint();
				const mdx = newMid.x - this.pinchMidpoint.x;
				const mdy = newMid.y - this.pinchMidpoint.y;
				const panScale = this.camera.distanceToTarget * 0.002;

				this.camera.pan(mdx * panScale, mdy * panScale);
				this.pinchMidpoint = newMid;
			}
		} else if (this.activePointers.size === 1) {
			if (!this.cameraControlRotate) return;

			if (e.pointerType === "touch" || this.dragButton === 0) {
				this.camera.rotate(-dx * 0.01, dy * 0.01);
				this.inertiaX = -dx * 0.01;
				this.inertiaY = dy * 0.01;
			} else if (
				this.cameraControlPan &&
				(this.dragButton === 1 || this.dragButton === 2)
			) {
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

		// Holding a pointer keeps the fixed mode, the restore delay counts
		// from the release.
		if (this.fixedOnInteract?.enabled && this.savedCameraMode !== null) {
			this.scheduleCameraModeRestore();
		}

		if (this.activePointers.size === 1) {
			this.pinchStartDist = 0;
		}

		if (this.activePointers.size === 0) {
			const isRotate =
				!hadMultiple && (e.pointerType === "touch" || this.dragButton === 0);
			const speed = Math.sqrt(
				this.inertiaX * this.inertiaX + this.inertiaY * this.inertiaY,
			);

			this.inertiaActive =
				isRotate && this.cameraControlRotate && speed > 0.001;
		}
	}

	/**
	 * Handles wheel events for zooming.
	 *
	 * @param e - The wheel event.
	 */
	private onWheel(e: WheelEvent): void {
		if (!this.cameraControlZoom) return;

		this.onCameraInteraction();
		e.preventDefault();
		this.camera.zoomBy(e.deltaY * 0.025);
	}
}
