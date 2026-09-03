export type DeepReadonly<T> = T extends readonly unknown[]
	? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T;

export type DeepRequired<T> = T extends readonly unknown[]
	? T
	: T extends object
		? { [K in keyof T]-?: DeepRequired<T[K]> }
		: T;

/**
 * Deep-freezes an effect's defaults object so the exported constant cannot
 * be mutated. Returns the same object, typed deeply readonly. Restore the
 * values onto an effect instance with `structuredClone`.
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
	if (typeof value === "object" && value !== null) {
		for (const key of Object.keys(value)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
		Object.freeze(value);
	}
	return value as DeepReadonly<T>;
}

function isArrayLike(value: unknown): value is ArrayLike<unknown> {
	return Array.isArray(value) || ArrayBuffer.isView(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !isArrayLike(value);
}

/**
 * Copies an array element by element into a plain array. Callers may hand
 * the effects reactive proxies (Svelte, Vue) or typed arrays, which
 * structuredClone rejects or would not turn into plain arrays.
 */
function copyArray(value: ArrayLike<unknown>): unknown[] {
	const out: unknown[] = [];
	for (let i = 0; i < value.length; i++) {
		const item = value[i];
		out.push(isArrayLike(item) ? copyArray(item) : item);
	}
	return out;
}

function arraysEqual(a: ArrayLike<unknown>, b: ArrayLike<unknown>): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (isArrayLike(x) && isArrayLike(y)) {
			if (!arraysEqual(x, y)) return false;
		} else if (x !== y) {
			return false;
		}
	}
	return true;
}

/**
 * Collects the settings that differ from their defaults, walking the shape
 * of the defaults so an effect instance's other members are ignored. Nested
 * groups keep their shape, arrays are copied whole when they differ.
 *
 * @param defaults - The defaults to compare against.
 * @param value - The effect instance or settings object to read.
 * @returns The differing settings, or undefined when nothing differs.
 */
export function diffFromDefaults(defaults: unknown, value: unknown): unknown {
	if (isArrayLike(defaults)) {
		if (isArrayLike(value) && arraysEqual(defaults, value)) return undefined;
		return isArrayLike(value) ? copyArray(value) : value;
	}
	if (isRecord(defaults)) {
		const source = isRecord(value) ? value : {};
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(defaults)) {
			const changed = diffFromDefaults(defaults[key], source[key]);
			if (changed !== undefined) out[key] = changed;
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}
	return value === defaults ? undefined : value;
}

/**
 * Restores an effect's settings from its defaults, keeping the effect's
 * current enabled state.
 */
export function resetEffect(
	effect: { enabled?: boolean },
	defaults: object,
): void {
	const enabled = effect.enabled ?? false;
	Object.assign(effect, structuredClone(defaults));
	effect.enabled = enabled;
}
