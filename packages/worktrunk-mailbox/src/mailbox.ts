// The worktrunk panel's mailbox, as other copies and other mods use it: a request posted
// to one shared-state key, which the shown panel reads and runs once. And the other way,
// the space groups the panel publishes for the sidebar's labels.
// Pure: no `herdr` or `gpui` imports.
import { Option } from "effect";
import { at, text } from "./json.ts";
import { findModBlock } from "./layout.ts";

/** The shared-state key the panel of the worktrunk mod `panelMod` reads requests from. */
export const requestKey = (panelMod: string): string => `${panelMod}.request.v1`;

/** What to do with a space's worktree, asked of the panel from a space's menu. */
export type SpaceAct = "NewOrOpen" | "Merge" | "Remove";

/** Every SpaceAct, for readers of a request. */
export const SPACE_ACTS: readonly SpaceAct[] = ["NewOrOpen", "Merge", "Remove"];

/**
 * The requests another mod (the menus mod's items in Herdr's menus) posts. The panel's
 * own Action type includes these, so it runs them like its own menus' requests.
 */
export type MenuRequest =
  /**
   * Open the New-or-open worktree dialog for the repo `folder` is in; null for the
   * focused folder. Outside every repo the dialog asks for one.
   */
  | { readonly _tag: "NewOrOpen"; readonly folder: string | null }
  /**
   * Act on the worktree the space `space` sits on: open the New-or-open dialog for its
   * repo, or merge or remove it (after the panel's usual confirm).
   */
  | { readonly _tag: "SpaceWorktree"; readonly space: string; readonly act: SpaceAct };

/** How a request reaches the panel. */
export type Delivery =
  /** The panel shows: post the request. */
  | { readonly _tag: "Post" }
  /** The panel is hidden and reads nothing: `layout.show` block `id`, then post. */
  | { readonly _tag: "ShowThenPost"; readonly id: string }
  /** The layout has no panel to read it. */
  | { readonly _tag: "NoPanel" };

/** How to deliver a request to the panel of `panelMod` in the shown `layout`. */
export const deliveryFor = (layout: unknown, panelMod: string): Delivery =>
  Option.match(findModBlock(layout, panelMod), {
    onNone: (): Delivery => ({ _tag: "NoPanel" }),
    onSome: (block): Delivery =>
      block.hidden ? { _tag: "ShowThenPost", id: block.id } : { _tag: "Post" },
  });

/** The shared-state key the panel of the worktrunk mod `panelMod` publishes space groups at. */
export const groupsKey = (panelMod: string): string => `${panelMod}.groups.v1`;

/**
 * The group the space `space` belongs to, from the space groups the panel published
 * (`groupsKey`): an object of space id to group name. None for a space it names no group
 * for (or an empty name), or a value of any other shape.
 */
export const spaceGroup = (published: unknown, space: string): Option.Option<string> =>
  Option.filter(text(at(published, space)), (group) => group !== "");
