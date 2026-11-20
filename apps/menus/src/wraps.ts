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
/** A space menu's popup: Herdr's 260 px, plus our four rows. */
export const SPACE_MENU_HEIGHT = 260 + 4 * ROW;

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

/**
 * How the sidebar copy draws a space, from the look our wrapper sets: its name in the
 * theme colour `look.nameColorOf(space)` gives, then one small pill per entry
 * `look.pillsOf(space)` gives, each in its own theme colour. A space git has no entry
 * for gets `look.gitOf(space)` instead (null for none), which Herdr's ordering then
 * nests by. Until the look is set, names are Herdr's foreground, there are no pills and
 * no fallback entries. Pills are drawn with the copy's own `div`, which the patch point
 * itself calls, so it is in scope.
 */
const SPACES_TAIL = `
;function __wtNameColor(w, t) { return t[__wtLook.nameColorOf(w)]; }
function __wtPills(w, t) {
  return __wtLook.pillsOf(w).map((pill) =>
    div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t[pill.color]).child(pill.label));
}
function __wtGitOf(w) { return __wtLook.gitOf(w); }
let __wtLook = { nameColorOf: () => "foreground", pillsOf: () => [], gitOf: () => null };
export function __wtSetLook(look) { __wtLook = look; }
`;

/** Herdr's space row draws the space's name with exactly this. */
const SPACE_NAME =
  ".child(div().flex_initial().min_w(SIDE_MIN).truncate().text_color(t.foreground).child(w.name))";

/**
 * Herdr's sidebar orders its spaces from exactly this row list: each space with its git
 * entry, null where git had no answer (as for a space whose folder is gone).
 */
const SPACE_ROWS = "const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));";

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
          {
            name: "spaces: space row's name",
            find: SPACE_NAME,
            replace: `${SPACE_NAME.replace("t.foreground", "__wtNameColor(w, t)")}.children(__wtPills(w, t))`,
          },
          {
            name: "spaces: ordering's git entries",
            find: SPACE_ROWS,
            replace: SPACE_ROWS.replace("?? null", "?? __wtGitOf(w)"),
          },
        ],
        tail: SPACES_TAIL,
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
