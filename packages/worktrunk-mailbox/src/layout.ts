// Finding the panel's own block in Herdr's layout tree (`layout()`, typed unknown).
// Pure: no `herdr` or `gpui` imports.
import { Option } from "effect";
import { at, fields, text } from "./json.ts";

export interface ModBlock {
  /** The node id, for `layout.hide` and `layout.toggle`. */
  readonly id: string;
  /** The block, or a node above it, is hidden. */
  readonly hidden: boolean;
}

/**
 * Every role a copy of the worktrunk mod plays, as its props' `role` names it. One mod
 * folder serves them all: layout blocks show the side `panel` (no role) and the tab-bar
 * `toggle` that shows and hides it; overlays are a `menu`, a `confirm` dialog, the `new`
 * worktree dialog, the `settings` dialog, and a job window's `titlebar`.
 */
export const ROLES = ["panel", "toggle", "menu", "confirm", "new", "settings", "titlebar"] as const;

export type Role = (typeof ROLES)[number];

/** The role a copy plays when its props give none: the side panel. */
export const PANEL_ROLE = "panel" satisfies Role;
/** The tab-bar button that shows and hides the panel. */
export const TOGGLE_ROLE = "toggle" satisfies Role;

/**
 * The role a copy of the mod plays, from the props its layout block or overlay gave
 * (`{ role: "toggle" }`): no role means the panel, and a name that isn't a role is none.
 */
export const roleOf = (props: unknown): Option.Option<Role> =>
  Option.match(text(at(props, "role")), {
    onNone: () => Option.some(PANEL_ROLE),
    onSome: (role) => Option.fromNullishOr(ROLES.find((known) => known === role)),
  });

const findIn = (
  node: unknown,
  mod: string,
  role: Role,
  hiddenAbove: boolean,
): Option.Option<ModBlock> => {
  const hidden = hiddenAbove || at(node, "hidden") === true;
  const match =
    at(node, "content", "mod") === mod &&
    Option.contains(roleOf(at(node, "content", "props")), role);
  if (match) {
    return Option.map(text(at(node, "id")), (id) => ({ id, hidden }));
  }
  const children = fields(node).children;
  return (Array.isArray(children) ? children : []).reduce<Option.Option<ModBlock>>(
    (found, child) => (Option.isSome(found) ? found : findIn(child, mod, role, hidden)),
    Option.none(),
  );
};

/**
 * The first block in `layout` that shows `mod` as the panel, with whether it is hidden.
 * Blocks showing the mod in another role (the tab-bar toggle) are skipped.
 */
export const findModBlock = (layout: unknown, mod: string): Option.Option<ModBlock> =>
  findRoleBlock(layout, mod, PANEL_ROLE);

/** The first block in `layout` that shows `mod` in `role`, with whether it is hidden. */
export const findRoleBlock = (layout: unknown, mod: string, role: Role): Option.Option<ModBlock> =>
  findIn(layout, mod, role, false);
