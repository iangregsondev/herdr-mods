// Which Herdr mod each copy of this mod wraps, and how its copy is patched.
// Pure: no `herdr` or `gpui` imports. The text below names Herdr's patch points only;
// Herdr's code itself is read from the installed app on the person's machine.
import { Option, type Result } from "effect";
import { at } from "worktrunk-mailbox";
import { applyPatches, type Miss, type Patch } from "./patch.ts";

/**
 * The part a copy of this mod plays, from its props: the tab bar and the sidebar (layout
 * blocks, in place of Herdr's `tabs` and `spaces`), or the "+" menu and the context menu
 * (popups they open, in place of `new-menu` and `menu`).
 */
export const ROLES = ["tabs", "spaces", "new-menu", "menu"] as const;

export type Role = (typeof ROLES)[number];

/** The role in a copy's props (`{ role: "spaces" }`); none when it names none of ours. */
export const roleIn = (props: unknown): Option.Option<Role> =>
  Option.fromNullishOr(ROLES.find((role) => role === at(props, "role")));

/** One menu row's height in Herdr's menus, in px. */
export const ROW = 31;
/** The "+" menu's popup: Herdr's 512 px, plus our row and the padding under it. */
export const NEW_MENU_HEIGHT = 512 + ROW + 5;
/** A space menu's popup: Herdr's 260 px, plus our three rows. */
export const SPACE_MENU_HEIGHT = 260 + 3 * ROW;

export interface Wrap {
  /** The Herdr mod whose `main.js` the copy is made from. */
  readonly mod: string;
  readonly patches: readonly Patch[];
  /** Appended to the patched copy. */
  readonly tail: string;
}

/**
 * The menu copy's own `items(p, git)` runs Herdr's list through an extension our
 * wrapper sets, and is exported so the wrapper's `choose` reads the same list.
 */
const MENU_TAIL = `
;function items(p, git) { return __wtExtend(__wtHerdrItems(p, git), p, git); }
let __wtExtend = (list) => list;
export function __wtSetExtend(extend) { __wtExtend = extend; }
export { items as __wtItems };
`;

/** What the copy for `role` is made from, for this mod's id `self`. */
export const wrapFor = (role: Role, self: string): Wrap => {
  switch (role) {
    case "tabs":
      return {
        mod: "tabs",
        patches: [
          {
            name: 'tabs: "+" button opens new-menu',
            find: 'openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })',
            replace: `openOverlay({ mod: ${JSON.stringify(self)}, kind: "popup", width: 250, height: ${NEW_MENU_HEIGHT}, props: { role: "new-menu" } })`,
          },
        ],
        tail: "",
      };
    case "spaces":
      return {
        mod: "spaces",
        patches: [
          {
            name: "spaces: space right-click opens menu",
            find: 'openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space",',
            replace: `openOverlay({ mod: ${JSON.stringify(self)}, kind: "popup", width: 200, height: ${SPACE_MENU_HEIGHT}, props: { role: "menu", tab: "space",`,
          },
        ],
        tail: "",
      };
    case "new-menu":
      return {
        mod: "new-menu",
        patches: [
          {
            // Herdr sizes the menu to its rows; ours goes inside it, so it is one row taller.
            name: "new-menu: menu height",
            find: ".w_full().h(Math.min(491, ",
            replace: `.w_full().h(${ROW} + Math.min(491, `,
          },
        ],
        tail: "",
      };
    case "menu":
      return {
        mod: "menu",
        patches: [
          {
            name: "menu: items(p, git) list",
            find: "function items(p, git) {",
            replace: "function __wtHerdrItems(p, git) {",
          },
        ],
        tail: MENU_TAIL,
      };
  }
};

/** The text of the copy for `wrap`, made from Herdr's `source`, or the patch points that missed. */
export const patchedSource = (wrap: Wrap, source: string): Result.Result<string, readonly Miss[]> =>
  applyPatches(source, wrap.patches, wrap.tail);
