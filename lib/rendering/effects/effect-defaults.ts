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
