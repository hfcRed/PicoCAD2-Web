import { OrbitCamera } from "./camera/orbit-camera.ts";
import {
	type DeepPartial,
	deepFreeze,
} from "./rendering/effects/effect-defaults.ts";
import type {
	BookmarkSettings,
	CameraSettings,
	LegacyViewerSettings,
	ModelSettings,
	ViewerSettings,
} from "./types/options.ts";
import type { CameraState, PicoCAD2Model } from "./types/scene.ts";

/**
 * The shading modes as PicoCAD 2 writes them. A file's value passes through
 * unchanged, so anything above `on` renders lit until the viewer learns
 * what PicoCAD 2 means by it.
 */
export const SHADING_MODE = Object.freeze({
	off: 0,
	on: 1,
});

/**
 * The render modes as PicoCAD 2 writes them (its face mode). A file's
 * value passes through unchanged, so anything unknown renders textured
 * until the viewer learns what PicoCAD 2 means by it.
 */
export const RENDER_MODE = Object.freeze({
	none: 0,
	color: 1,
	texture: 2,
});

const initialCamera = new OrbitCamera();

/**
 * Copies a camera state into the plain shape a state stores.
 *
 * @param state - The camera or bookmark state.
 * @returns The plain copy.
 */
export function bookmarkSettingsOf(
	state: Pick<CameraState, "omega" | "theta" | "distanceToTarget"> & {
		target: ArrayLike<number>;
	},
): BookmarkSettings {
	return {
		omega: state.omega,
		theta: state.theta,
		distanceToTarget: state.distanceToTarget,
		target: [state.target[0], state.target[1], state.target[2]],
	};
}

export const MODEL_SETTINGS_DEFAULTS = deepFreeze<ModelSettings>({
	shadingMode: SHADING_MODE.on,
	renderMode: RENDER_MODE.texture,
	projectionMode: "perspective",
	outlineSize: 0,
	outlineColor: [0, 0, 0],
	scanlines: false,
	scanlineColor: [0, 0, 0],
	cameraMode: "fixed",
	cameraModeSpeed: 5,
	cameraModeDirection: "left",
	leftTag: null,
	rightTag: null,
	animation: { time: 0, playing: false, loops: 1 },
	camera: { ...bookmarkSettingsOf(initialCamera), zoom: initialCamera.zoom },
	bookmark: bookmarkSettingsOf(initialCamera),
});

export const VIEWER_SETTINGS_DEFAULTS = deepFreeze<ViewerSettings>({
	backgroundColor: null,
	resolution: { width: 128, height: 128, scale: 1 },
	maxFps: 60,
	clampCameraDistance: { enabled: false, minimumDistance: 0 },
	animationSpeed: 1,
	animationLoop: true,
});

/**
 * Returns a fresh mutable copy of {@link MODEL_SETTINGS_DEFAULTS}.
 *
 * @returns The model settings of a viewer without a model.
 */
export function getDefaultModelSettings(): ModelSettings {
	return structuredClone(MODEL_SETTINGS_DEFAULTS) as ModelSettings;
}

/**
 * Returns a fresh mutable copy of {@link VIEWER_SETTINGS_DEFAULTS}.
 *
 * @returns The viewer settings of a freshly constructed viewer.
 */
export function getDefaultViewerSettings(): ViewerSettings {
	return structuredClone(VIEWER_SETTINGS_DEFAULTS) as ViewerSettings;
}

/**
 * Reads the settings a model file carries, as `load()` applies them. The
 * file knows no zoom, so that one is the default.
 *
 * @param model - The parsed model.
 * @returns The file's settings, sharing nothing with the model.
 */
export function modelSettingsOf(model: PicoCAD2Model): ModelSettings {
	const es = model.exportSettings;
	const camera: CameraSettings = {
		...bookmarkSettingsOf(model.camera),
		zoom: MODEL_SETTINGS_DEFAULTS.camera.zoom,
	};
	return {
		shadingMode: model.shadingMode,
		renderMode: model.renderMode,
		projectionMode: model.projectionMode,
		outlineSize: es.outlineSize,
		outlineColor: [...es.outlineColor],
		scanlines: es.scanlines,
		scanlineColor: [...es.scanlineColor],
		cameraMode: es.cameraMode,
		cameraModeSpeed: es.cameraModeSpeed,
		cameraModeDirection: es.cameraModeDirection,
		leftTag: es.watermark2
			? { text: es.watermark2, color: [...es.watermark2Color] }
			: null,
		rightTag: es.watermark
			? { text: es.watermark, color: [...es.watermarkColor] }
			: null,
		animation: { time: 0, playing: es.animate, loops: es.animateLoops },
		camera,
		bookmark: bookmarkSettingsOf(model.bookmark),
	};
}

/**
 * Splits the flat settings of a state saved by an earlier version into the
 * model and viewer groups. Settings the state predates stay absent, so the
 * caller decides what they fall back to.
 *
 * @param s - The legacy settings.
 * @returns The two groups.
 */
export function splitLegacySettings(s: LegacyViewerSettings): {
	model: DeepPartial<ModelSettings>;
	viewer: DeepPartial<ViewerSettings>;
} {
	const renderMode =
		s.renderMode === "none"
			? RENDER_MODE.none
			: s.renderMode === "color"
				? RENDER_MODE.color
				: RENDER_MODE.texture;
	return {
		model: {
			shadingMode: s.shading ? SHADING_MODE.on : SHADING_MODE.off,
			renderMode,
			projectionMode: s.projectionMode,
			outlineSize: s.outlineSize,
			outlineColor: s.outlineColor,
			scanlines: s.scanlines,
			scanlineColor: s.scanlineColor,
			cameraMode: s.cameraMode,
			cameraModeSpeed: s.cameraModeSpeed,
			cameraModeDirection: s.cameraModeDirection,
			leftTag: s.leftTag,
			rightTag: s.rightTag,
			animation: {
				time: s.animation.time,
				playing: s.animation.playing,
				...(s.animation.loops !== undefined
					? { loops: s.animation.loops }
					: {}),
			},
			camera: s.camera,
			bookmark: s.bookmark,
		},
		viewer: {
			backgroundColor: s.backgroundColor,
			resolution: s.resolution,
			animationSpeed: s.animation.speed,
			animationLoop: s.animation.loop,
			...(s.maxFps !== undefined ? { maxFps: s.maxFps } : {}),
			...(s.clampCameraDistance !== undefined
				? { clampCameraDistance: s.clampCameraDistance }
				: {}),
		},
	};
}
