// Keyboard commands from `keys.json` (`"<keys>": "iangregsondev-worktrunk.<command>"`):
// which copy of the mod acts on each, and what it does.
// Pure: no `herdr` or `gpui` imports.
import { Option } from "effect";
import {
  findModBlock,
  findRoleBlock,
  PANEL_ROLE,
  TOGGLE_ROLE,
  type ModBlock,
  type Role,
} from "worktrunk-mailbox";
import type { Action } from "./menus.ts";
import type { Request } from "./wire.ts";

/** The commands the panel runs itself; `toggle` shows or hides the panel. */
export type PanelCommand = "refresh" | "new" | "settings" | "focus";

/** The shown layout, as far as commands care: the panel's block and the toggle copy. */
export interface Copies {
  readonly panel: Option.Option<ModBlock>;
  /** A tab-bar toggle copy is in the layout and shows. */
  readonly toggleShown: boolean;
}

/** What one copy does with a command. */
export type Step =
  /** The panel runs the command itself. */
  | { readonly _tag: "Run"; readonly command: PanelCommand }
  /** Show the hidden panel's block, then hand it the command through the mailbox. */
  | { readonly _tag: "ShowThen"; readonly id: string; readonly command: PanelCommand }
  /** `layout.toggle` the panel's block. */
  | { readonly _tag: "Toggle"; readonly id: string }
  /** The layout has no panel block to show. */
  | { readonly _tag: "NoPanel" }
  | { readonly _tag: "Unknown"; readonly command: string }
  /** Another copy acts on it, or none should. */
  | { readonly _tag: "Ignore" };

const IGNORE: Step = { _tag: "Ignore" };

const PANEL_COMMANDS: readonly string[] = ["refresh", "new", "settings", "focus"];

const isPanelCommand = (command: string): command is PanelCommand =>
  PANEL_COMMANDS.includes(command);

/**
 * What the copy playing `role` does with `command`. Herdr hands a command to every shown
 * copy, and a hidden one gets nothing, so exactly one copy acts:
 * - `toggle`: the toggle copy while it shows (it stays shown when the panel hides, so it
 *   can show it again); with no toggle copy shown, the panel, which can only hide itself.
 * - the panel's own commands, and unknown ones: the panel while it shows; while it is
 *   hidden, the toggle copy shows it and hands the command on.
 * - overlays never act on one.
 */
export const routeCommand = (command: string, role: Role, copies: Copies): Step => {
  if (role !== PANEL_ROLE && role !== TOGGLE_ROLE) return IGNORE;
  if (command === "toggle") {
    if (role === PANEL_ROLE && copies.toggleShown) return IGNORE;
    return Option.match(copies.panel, {
      onNone: (): Step => (role === TOGGLE_ROLE ? { _tag: "NoPanel" } : IGNORE),
      onSome: (block): Step => ({ _tag: "Toggle", id: block.id }),
    });
  }
  if (role === PANEL_ROLE) {
    return isPanelCommand(command) ? { _tag: "Run", command } : { _tag: "Unknown", command };
  }
  return Option.match(copies.panel, {
    onNone: (): Step => ({ _tag: "NoPanel" }),
    onSome: (block): Step =>
      !block.hidden
        ? IGNORE
        : isPanelCommand(command)
          ? { _tag: "ShowThen", id: block.id, command }
          : { _tag: "Unknown", command },
  });
};

const COMMAND_ACTIONS: Readonly<Record<PanelCommand, Action>> = {
  refresh: { _tag: "Refresh" },
  settings: { _tag: "Settings" },
  new: { _tag: "NewOrOpen", folder: null },
  focus: { _tag: "Focus" },
};

/** The mailbox action the panel runs for a command. */
export const actionFor = (command: PanelCommand): Action => COMMAND_ACTIONS[command];

/** The copies commands care about, from Herdr's shown layout (`layout()`). */
export const copiesIn = (layout: unknown, mod: string): Copies => ({
  panel: findModBlock(layout, mod),
  toggleShown: Option.exists(findRoleBlock(layout, mod, TOGGLE_ROLE), (block) => !block.hidden),
});

/**
 * How long a mailbox request stays fresh, in ms. A panel that starts runs a fresh one (the
 * toggle copy just showed it to hand on a command) and skips an older one, left over
 * from an earlier run.
 */
export const FRESH_FOR = 5_000;

/** A request posted at `sent` (ms, its id's whole part) is stale at `now`. */
export const isLeftover = (sent: number, now: number): boolean => now - sent > FRESH_FOR;

/** The mailbox request a panel that starts counts as handled already. */
export const handledAtStart = (
  request: Option.Option<Request>,
  now: number,
): Option.Option<number> =>
  Option.filter(
    Option.map(request, ({ id }) => id),
    (id) => isLeftover(id, now),
  );

/** A toast's text. */
export interface Notice {
  readonly title: string;
  readonly body: string;
}

/** The warning a step shows; none for a step that acts. */
export const noticeFor = (step: Step): Option.Option<Notice> => {
  switch (step._tag) {
    case "NoPanel":
      return Option.some({
        title: "No worktrunk panel here",
        body: "This layout has no worktrunk panel block to show.",
      });
    case "Unknown":
      return Option.some({
        title: "Unknown worktrunk command",
        body: `"${step.command}": use refresh, new, settings, focus or toggle.`,
      });
    default:
      return Option.none();
  }
};
