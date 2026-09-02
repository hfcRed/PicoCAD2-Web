import videoEffectsFrag from "../../shaders/effects/video-effects.frag";
import type { VideoEffectsOptions } from "../../types/options.ts";
import type { Color3 } from "../../types/scene.ts";
import {
	type DeepRequired,
	deepFreeze,
	resetEffect,
} from "./effect-defaults.ts";
import { FullscreenEffect } from "./fullscreen-effect.ts";
import type { EffectContext } from "./types.ts";

export type ScreenType =
	| "crt"
	| "lcd"
	| "tn"
	| "oled"
	| "gameboy"
	| "projector";
export type GameboyPalette = "dmg" | "pocket" | "custom";

const SCREEN_TYPE_ID: Record<ScreenType, number> = {
	crt: 0,
	lcd: 1,
	tn: 2,
	oled: 3,
	gameboy: 4,
	projector: 5,
};

const DMG_COLORS: Color3[] = [
	[15 / 255, 56 / 255, 15 / 255],
	[48 / 255, 98 / 255, 48 / 255],
	[139 / 255, 172 / 255, 15 / 255],
	[155 / 255, 188 / 255, 15 / 255],
];

const POCKET_COLORS: Color3[] = [
	[0, 0, 0],
	[1 / 3, 1 / 3, 1 / 3],
	[2 / 3, 2 / 3, 2 / 3],
	[1, 1, 1],
];

/** Reference time constant in seconds for gameboy ghosting = 1. */
const GAMEBOY_GHOST_TAU = 0.35;

/** Minimum frame delta for ghost decay */
const MIN_GHOST_DT = 1 / 240;

/**
 * Unified whole-display simulation. One effect with a `screenType` enum,
 * shared controls (virtual resolution, brightness/saturation/contrast,
 * grid strength) and per-type settings. The virtual `resolution` quantizes
 * color per virtual pixel while the subpixel/grid structure renders at
 * full output resolution. At the default `0` there is neither quantization
 * nor grid. Temporal ghosting (CRT phosphor fade, gameboy
 * smear) persists across frames.
 *
 * No color mask. Supersedes the deprecated standalone CRT effect.
 */
export class VideoEffectsEffect extends FullscreenEffect {
	private historyGl: WebGL2RenderingContext | null = null;
	private historyTex: WebGLTexture | null = null;
	private historyWidth = 0;
	private historyHeight = 0;
	private historyValid = false;
	private lastTime = 0;
	private pendingDecay = 0;

	/**
	 * Creates a new video effects screen simulation.
	 */
	constructor() {
		super(
			"videoEffects",
			videoEffectsFrag,
			(ctx: EffectContext) => this.getUniforms(ctx),
			true,
		);
		this.reset();
	}

	/** Restores every setting to its default value, keeping the enabled state. */
	reset(): void {
		resetEffect(this, VIDEO_EFFECTS_DEFAULTS);
	}

	/**
	 * Applies the screen simulation. When ghosting is active, maintains the
	 * private history texture. The shader blends the previous frame in, and
	 * the freshly written output is copied back out of the bound FBO after
	 * the draw.
	 *
	 * @param ctx - The rendering context info.
	 * @param inputTexture - The texture to read from.
	 */
	apply(ctx: EffectContext, inputTexture: WebGLTexture): void {
		const gl = ctx.gl;
		const tau = this.ghostTau();
		const dt = Math.max(ctx.time - this.lastTime, 0);
		this.lastTime = ctx.time;

		if (tau > 0) {
			this.ensureHistory(gl, ctx.width, ctx.height);
			this.pendingDecay = this.historyValid
				? Math.exp(-Math.max(dt, MIN_GHOST_DT) / tau)
				: 0;
		} else {
			this.pendingDecay = 0;
			this.historyValid = false;
		}

		super.apply(ctx, inputTexture);

		if (tau > 0) {
			gl.bindTexture(gl.TEXTURE_2D, this.historyTex);
			gl.readBuffer(gl.COLOR_ATTACHMENT0);
			gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, ctx.width, ctx.height);
			this.historyValid = true;
		}
	}

	/**
	 * Frees the history texture along with the base resources.
	 */
	dispose(): void {
		if (this.historyTex && this.historyGl) {
			this.historyGl.deleteTexture(this.historyTex);
		}
		this.historyGl = null;
		this.historyTex = null;
		this.historyValid = false;
		this.historyWidth = 0;
		this.historyHeight = 0;
		super.dispose();
	}

	/**
	 * Returns the active ghosting time constant in seconds, 0 when off.
	 */
	private ghostTau(): number {
		if (this.screenType === "crt") return Math.max(this.crt.pixelFadeTime, 0);
		if (this.screenType === "gameboy") {
			return Math.max(this.gameboy.ghosting, 0) * GAMEBOY_GHOST_TAU;
		}
		return 0;
	}

	/**
	 * Ensures the history texture matches the output dimensions.
	 *
	 * @param gl - The WebGL 2 rendering context.
	 * @param w - The required width.
	 * @param h - The required height.
	 */
	private ensureHistory(
		gl: WebGL2RenderingContext,
		w: number,
		h: number,
	): void {
		if (this.historyTex && this.historyWidth === w && this.historyHeight === h)
			return;

		if (this.historyTex) gl.deleteTexture(this.historyTex);
		this.historyGl = gl;
		this.historyTex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, this.historyTex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			w,
			h,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		this.historyWidth = w;
		this.historyHeight = h;
		this.historyValid = false;
	}

	/**
	 * Returns the uniform values for the video effects shader.
	 *
	 * @param ctx - The rendering context info.
	 * @returns The uniform values.
	 */
	private getUniforms(ctx: EffectContext): Record<string, unknown> {
		const gb =
			this.gameboy.palette === "dmg"
				? DMG_COLORS
				: this.gameboy.palette === "pocket"
					? POCKET_COLORS
					: this.gameboy.customColors;

		return {
			u_backgroundColor: ctx.backgroundColor,
			u_resolution: [ctx.width, ctx.height],
			u_time: ctx.time,
			u_screenType: SCREEN_TYPE_ID[this.screenType] ?? 0,
			u_virtualRes: Math.max(this.resolution, 0),
			u_brightness: this.brightness,
			u_saturation: this.saturation,
			u_contrastBoost: this.contrastBoost,
			u_gridStrength: this.gridStrength,
			u_curvature: this.crt.curvature,
			u_scanlineIntensity: this.crt.scanlineIntensity,
			u_refreshRate: this.crt.refreshRate,
			u_gbColors: gb.flat(),
			u_angleShift: this.tn.angleShift,
			u_blackCrush: this.oled.blackCrush,
			u_pentile: this.oled.pentile,
			u_keystone: this.projector.keystone,
			u_hotspot: this.projector.hotspot,
			u_halo: this.projector.halo,
			u_history: this.historyTex ?? ctx.indexTexture,
			u_decay: this.pendingDecay,
		};
	}
}

export interface VideoEffectsEffect extends Required<VideoEffectsOptions> {
	crt: {
		curvature: number;
		scanlineIntensity: number;
		refreshRate: number;
		pixelFadeTime: number;
	};
	gameboy: {
		palette: GameboyPalette;
		customColors: Color3[];
		ghosting: number;
	};
	tn: { angleShift: number };
	oled: { blackCrush: number; pentile: boolean };
	projector: { keystone: number; hotspot: number; halo: number };
}

/** Default settings for {@link VideoEffectsEffect}. */
export const VIDEO_EFFECTS_DEFAULTS = deepFreeze<
	DeepRequired<VideoEffectsOptions>
>({
	enabled: false,
	modelOnly: true,
	screenType: "crt",
	resolution: 0,
	brightness: 1,
	saturation: 1,
	contrastBoost: 0,
	gridStrength: 0.5,
	crt: {
		curvature: 0.5,
		scanlineIntensity: 0.3,
		refreshRate: 0,
		pixelFadeTime: 0,
	},
	gameboy: {
		palette: "dmg",
		customColors: DMG_COLORS.map((c): Color3 => [...c]),
		ghosting: 0.3,
	},
	tn: { angleShift: 0.5 },
	oled: { blackCrush: 0.5, pentile: false },
	projector: { keystone: 0.2, hotspot: 0.4, halo: 0.3 },
});
