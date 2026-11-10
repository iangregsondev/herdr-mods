// What the panel keeps in Herdr's shared state, read back into typed values. Shared state
// may hold anything (another mod's write, an older build's), so every reader checks the
// shape and leaves out what it can't read. Pure: no `herdr` or `gpui` imports.
import { Predicate } from "effect";
import { fields } from "./json.ts";

/** The folded repos and groups record; entries that aren't true or false are left out. */
export const readFolded = (value: unknown): Readonly<Record<string, boolean>> =>
  Object.fromEntries(
    Object.entries(fields(value)).flatMap(([key, folded]) =>
      Predicate.isBoolean(folded) ? [[key, folded] as const] : [],
    ),
  );
