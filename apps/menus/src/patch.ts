// Text patches of the copy of a Herdr mod, applied all or nothing.
// Pure: no `herdr` or `gpui` imports.
import { Result } from "effect";

/** One exact replacement in Herdr's file. */
export interface Patch {
  /** Named when the patch point no longer fits Herdr's code. */
  readonly name: string;
  /** Exact text that must occur once in Herdr's file. */
  readonly find: string;
  readonly replace: string;
}

/** A patch point that didn't occur exactly once, and how often it did. */
export interface Miss {
  readonly name: string;
  readonly found: number;
}

const occurrences = (text: string, find: string): number =>
  find === "" ? 0 : text.split(find).length - 1;

/**
 * `source` with every patch applied and `tail` appended, or every patch point that
 * doesn't occur exactly once. Nothing is applied unless all fit: a half-patched copy of
 * Herdr's code is never run.
 */
export const applyPatches = (
  source: string,
  patches: readonly Patch[],
  tail = "",
): Result.Result<string, readonly Miss[]> => {
  const misses = patches
    .map((patch) => ({ name: patch.name, found: occurrences(source, patch.find) }))
    .filter((miss) => miss.found !== 1);
  if (misses.length > 0) return Result.fail(misses);
  // split/join, not replace: a `$` in the replacement stays literal.
  return Result.succeed(
    patches.reduce((text, p) => text.split(p.find).join(p.replace), source) + tail,
  );
};

/** The patch points that missed, for the person: names and counts. */
export const describeMisses = (misses: readonly Miss[]): string =>
  misses
    .map(({ name, found }) =>
      found === 0 ? `${name} (not found)` : `${name} (found ${found} times, expected once)`,
    )
    .join(", ");
