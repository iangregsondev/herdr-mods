// Reading JSON from outside (wt's output, the settings file, shared state) into typed
// values. Pure.
//
// Effect's `Schema` would do this, but loading it builds a `TextEncoder`, which Herdr's
// runtime doesn't have, so the mod fails to load. These small readers use `Predicate`.
import { Option, Predicate, Result } from "effect";

/** `text` as JSON, or the parser's message. */
export const parseJson = (text: string): Result.Result<unknown, string> =>
  Result.try({
    try: (): unknown => JSON.parse(text),
    catch: (error) => (error instanceof Error ? error.message : String(error)),
  });

/** The value at `path` inside nested objects, or undefined. */
export const at = (value: unknown, ...path: readonly string[]): unknown =>
  path.reduce<unknown>((inner, key) => (Predicate.isObject(inner) ? inner[key] : undefined), value);

/** An object's fields; anything else has none. */
export const fields = (value: unknown): Readonly<Record<PropertyKey, unknown>> =>
  Predicate.isObject(value) ? value : {};

/** A finite number, else none. */
export const finite = (value: unknown): Option.Option<number> =>
  Predicate.isNumber(value) && Number.isFinite(value) ? Option.some(value) : Option.none();

/** A string, else none. */
export const text = (value: unknown): Option.Option<string> =>
  Predicate.isString(value) ? Option.some(value) : Option.none();

/** A boolean, else none. */
export const bool = (value: unknown): Option.Option<boolean> =>
  Predicate.isBoolean(value) ? Option.some(value) : Option.none();

/** A list whose every item `read` accepts, else none. */
export const listOf = <A>(
  value: unknown,
  read: (item: unknown) => Option.Option<A>,
): Option.Option<readonly A[]> =>
  Array.isArray(value) ? Option.all(value.map(read)) : Option.none();

/** A string or null, else none. */
export const textOrNull = (value: unknown): Option.Option<string | null> =>
  value === null ? Option.some(null) : text(value);
