/**
 * Easing function matching PicoCAD 2's tweening system.
 *
 * @param t - Current elapsed time.
 * @param b - Start value.
 * @param c - Change in value (end - start).
 * @param d - Duration.
 * @returns The interpolated value.
 */
export type EasingFunction = (
	t: number,
	b: number,
	c: number,
	d: number,
) => number;

/**
 * Instant jump to end value.
 *
 * @param t - Current time.
 * @param b - Start value.
 * @param c - Change in value.
 * @param _d - Duration (unused).
 * @returns Start value if t <= 0, otherwise end value.
 */
function easeInstant(t: number, b: number, c: number, _d: number): number {
	if (t <= 0) return b;
	return c + b;
}

/**
 * Linear interpolation.
 *
 * @param t - Current time.
 * @param b - Start value.
 * @param c - Change in value.
 * @param d - Duration.
 * @returns The linearly interpolated value.
 */
function easeLinear(t: number, b: number, c: number, d: number): number {
	t = t < 0 ? 0 : t;
	return (c * t) / d + b;
}

/**
 * Quadratic ease in-out.
 *
 * @param t - Current time.
 * @param b - Start value.
 * @param c - Change in value.
 * @param d - Duration.
 * @returns The eased value.
 */
function easeInOutQuad(t: number, b: number, c: number, d: number): number {
	t = t < 0 ? 0 : t;
	t = (t / d) * 2;
	if (t < 1) {
		return (c / 2) * t * t + b;
	}
	return (-c / 2) * ((t - 1) * (t - 3) - 1) + b;
}

/**
 * Quintic ease in.
 *
 * @param t - Current time.
 * @param b - Start value.
 * @param c - Change in value.
 * @param d - Duration.
 * @returns The eased value.
 */
function easeInQuint(t: number, b: number, c: number, d: number): number {
	t = t < 0 ? 0 : t;
	t = t / d;
	return c * t ** 5 + b;
}

/**
 * Quintic ease out.
 *
 * @param t - Current time.
 * @param b - Start value.
 * @param c - Change in value.
 * @param d - Duration.
 * @returns The eased value.
 */
function easeOutQuint(t: number, b: number, c: number, d: number): number {
	t = t < 0 ? 0 : t;
	t = t / d - 1;
	return c * (t ** 5 + 1) + b;
}

/**
 * Back ease out (overshoot then settle).
 *
 * @param t - Current time.
 * @param b - Start value.
 * @param c - Change in value.
 * @param d - Duration.
 * @returns The eased value.
 */
function easeOutBack(t: number, b: number, c: number, d: number): number {
	const s = 1.70158;
	t = t < 0 ? 0 : t;
	t = t / d - 1;
	return c * (t * t * ((s + 1) * t + s) + 1) + b;
}

/**
 * Bounce ease out.
 *
 * @param t - Current time.
 * @param b - Start value.
 * @param c - Change in value.
 * @param d - Duration.
 * @returns The eased value.
 */
function easeOutBounce(t: number, b: number, c: number, d: number): number {
	t = t < 0 ? 0 : t;
	t = t / d;
	if (t < 1 / 2.75) {
		return c * (7.5625 * t * t) + b;
	}
	if (t < 2 / 2.75) {
		t = t - 1.5 / 2.75;
		return c * (7.5625 * t * t + 0.75) + b;
	}
	if (t < 2.5 / 2.75) {
		t = t - 2.25 / 2.75;
		return c * (7.5625 * t * t + 0.9375) + b;
	}
	t = t - 2.625 / 2.75;
	return c * (7.5625 * t * t + 0.984375) + b;
}

/**
 * Wraps an easing function to play forward then backward (pingpong).
 * Matches helpers.lua:176-181.
 *
 * @param base - The base easing function to wrap.
 * @returns The pingpong-wrapped easing function.
 */
export function pingpong(base: EasingFunction): EasingFunction {
	return (t: number, b: number, c: number, d: number): number => {
		if (t > d / 2) {
			t = d - t;
		}
		return base(t * 2, b, c, d);
	};
}

/** Map of curve name strings to easing functions */
const EASING_FUNCTIONS: Record<string, EasingFunction> = {
	linear: easeLinear,
	soft: easeInOutQuad,
	elastic: easeOutBack,
	bounce: easeOutBounce,
	instant: easeInstant,
	pinch: pingpong(easeInOutQuad),
	"ease in": easeInQuint,
	"ease out": easeOutQuint,
};

/**
 * Looks up an easing function by its curve name.
 * Falls back to linear if the name is not recognized.
 *
 * @param name - The curve name from the animation clip.
 * @returns The corresponding easing function.
 */
export function getEasingFunction(name: string): EasingFunction {
	return EASING_FUNCTIONS[name] ?? easeLinear;
}
