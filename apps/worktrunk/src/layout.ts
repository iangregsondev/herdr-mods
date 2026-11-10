// Finding the panel's own block in Herdr's layout tree (`layout()`, typed unknown).
// Pure: no `herdr` or `gpui` imports.
import { Option } from "effect";
import { at, fields, text } from "./json.ts";

export interface ModBlock {
  /** The node id, for `layout.hide`. */
  readonly id: string;
  /** The block, or a node above it, is hidden. */
  readonly hidden: boolean;
}

const findIn = (node: unknown, mod: string, hiddenAbove: boolean): Option.Option<ModBlock> => {
  const hidden = hiddenAbove || at(node, "hidden") === true;
  if (at(node, "content", "mod") === mod) {
    return Option.map(text(at(node, "id")), (id) => ({ id, hidden }));
  }
  const children = fields(node).children;
  return (Array.isArray(children) ? children : []).reduce<Option.Option<ModBlock>>(
    (found, child) => (Option.isSome(found) ? found : findIn(child, mod, hidden)),
    Option.none(),
  );
};

/** The first block in `layout` that shows `mod`, with whether it is hidden. */
export const findModBlock = (layout: unknown, mod: string): Option.Option<ModBlock> =>
  findIn(layout, mod, false);
