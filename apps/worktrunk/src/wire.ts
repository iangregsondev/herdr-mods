// What one copy of the mod hands another as plain data, read back into typed values: the
// view state and folded record in shared state, mailbox requests and overlay props.
// Shared state and props may hold anything (another mod's write, an older build's), so
// every reader checks the shape and leaves out what it can't read. Pure: no `herdr` or
// `gpui` imports.
import { Option, Predicate } from "effect";
import type { Batch, Linked, MergeMode } from "./commands.ts";
import { bool, fields, finite, listOf, text, textOrNull } from "./json.ts";
import type { Role } from "./layout.ts";
import { confirmFor, type Action, type Confirm, type MenuItem } from "./menus.ts";
import { DEFAULT_VIEW_STATE, SHOWS, type Click, type Show, type ViewState } from "./view.ts";

/** The view state as kept in shared state: plain JSON. */
export interface StoredViewState {
  readonly group: string | null;
  readonly show: Show;
  readonly only: boolean;
}

export const writeViewState = (state: ViewState): StoredViewState => ({
  group: Option.getOrNull(state.group),
  show: state.show,
  only: state.only,
});

const readShow = (value: unknown): Option.Option<Show> =>
  Option.fromNullishOr(SHOWS.find(([show]) => show === value)?.[0]);

/** The view state kept in shared state; anything missing or unreadable is the default. */
export const readViewState = (value: unknown): ViewState => {
  const { group, show, only } = fields(value);
  return {
    group: text(group),
    show: Option.getOrElse(readShow(show), () => DEFAULT_VIEW_STATE.show),
    only: Predicate.isBoolean(only) ? only : DEFAULT_VIEW_STATE.only,
  };
};

/** The folded repos and groups record; entries that aren't true or false are left out. */
export const readFolded = (value: unknown): Readonly<Record<string, boolean>> =>
  Object.fromEntries(
    Object.entries(fields(value)).flatMap(([key, folded]) =>
      Predicate.isBoolean(folded) ? [[key, folded] as const] : [],
    ),
  );

const oneOf =
  <A extends string>(options: readonly A[]) =>
  (value: unknown): Option.Option<A> =>
    Option.fromNullishOr(options.find((option) => option === value));

const readMode = oneOf<MergeMode>(["squash", "keep"]);

const readClick = (value: unknown): Option.Option<Click> => {
  const f = fields(value);
  switch (f._tag) {
    case "Select":
      return Option.map(text(f.space), (space): Click => ({ _tag: "Select", space }));
    case "New":
      return Option.map(
        Option.all({ name: text(f.name), folder: text(f.folder) }),
        (click): Click => ({ _tag: "New", ...click }),
      );
    default:
      return Option.none();
  }
};

const readLinked = (value: unknown): Option.Option<Linked> => {
  const f = fields(value);
  return Option.all({ main: text(f.main), path: text(f.path), branch: text(f.branch) });
};

const readBatch = (value: unknown): Option.Option<Batch> => {
  const f = fields(value);
  return Option.all({ main: text(f.main), branches: listOf(f.branches, text) });
};

/** An Action, as `send` posts it or a menu item carries it; none for anything else. */
export const readAction = (value: unknown): Option.Option<Action> => {
  const f = fields(value);
  switch (f._tag) {
    case "Open":
      return Option.map(readClick(f.click), (click): Action => ({ _tag: "Open", click }));
    case "Merge":
      return Option.map(
        Option.all({ target: readLinked(f.target), mode: readMode(f.mode), dirty: bool(f.dirty) }),
        (merge): Action => ({ _tag: "Merge", ...merge }),
      );
    case "Remove":
      return Option.map(
        Option.all({ target: readLinked(f.target), dirty: bool(f.dirty) }),
        (remove): Action => ({ _tag: "Remove", ...remove }),
      );
    case "Cleanup":
      return Option.map(
        Option.all({
          batches: listOf(f.batches, readBatch),
          paths: listOf(f.paths, text),
          dirty: finite(f.dirty),
        }),
        (cleanup): Action => ({ _tag: "Cleanup", ...cleanup }),
      );
    case "New":
      return Option.map(text(f.main), (main): Action => ({ _tag: "New", main }));
    case "Create":
      return Option.map(
        Option.all({ main: text(f.main), name: text(f.name), base: textOrNull(f.base) }),
        (create): Action => ({ _tag: "Create", ...create }),
      );
    case "CopyPath":
      return Option.map(text(f.path), (path): Action => ({ _tag: "CopyPath", path }));
    case "Reveal":
      return Option.map(text(f.path), (path): Action => ({ _tag: "Reveal", path }));
    case "Hide":
      return Option.map(text(f.root), (root): Action => ({ _tag: "Hide", root }));
    case "Refresh":
      return Option.some({ _tag: "Refresh" });
    case "Settings":
      return Option.some({ _tag: "Settings" });
    case "Focus":
      return Option.some({ _tag: "Focus" });
    case "NewHere":
      return Option.some({ _tag: "NewHere" });
    default:
      return Option.none();
  }
};

/** A request in the panel's mailbox: an Action, and an id so it runs once. */
export interface Request {
  /** When it was posted, in ms, plus a random fraction. */
  readonly id: number;
  readonly action: Action;
}

/** The mailbox's request; none when it holds nothing the panel can run. */
export const readRequest = (value: unknown): Option.Option<Request> => {
  const f = fields(value);
  return Option.all({ id: finite(f.id), action: readAction(f.action) });
};

/** The overlay id Herdr adds to an overlay's props; none for a layout block. */
export const overlayOf = (props: unknown): Option.Option<string> => text(fields(props).overlay);

const readMenuItem = (value: unknown): Option.Option<MenuItem> => {
  const f = fields(value);
  return Option.all({ label: text(f.label), danger: bool(f.danger), action: readAction(f.action) });
};

/** A menu overlay's props (a type, not an interface, so it passes as `openOverlay`'s props). */
export type MenuProps = {
  readonly title: string;
  readonly items: readonly MenuItem[];
};

/** A menu's props read back; an item that can't be read is left out. */
export const readMenuProps = (props: unknown): MenuProps => {
  const f = fields(props);
  return {
    title: Option.getOrElse(text(f.title), () => ""),
    items: Array.isArray(f.items)
      ? f.items.flatMap((item) => Option.toArray(readMenuItem(item)))
      : [],
  };
};

/** What a confirm dialog asks, and the Action it guards. */
export interface ConfirmProps {
  readonly confirm: Confirm;
  readonly action: Action;
}

/**
 * The confirm dialog's question, from the Action in its props: the text is worked out
 * again from the Action, so it always matches what runs. None when there is no Action
 * that needs asking.
 */
export const readConfirmProps = (props: unknown): Option.Option<ConfirmProps> =>
  Option.flatMap(readAction(fields(props).action), (action) =>
    Option.map(confirmFor(action), (confirm) => ({ confirm, action })),
  );

/** The job window's title bar props. */
export interface TitlebarProps {
  readonly title: string;
  /** The job's terminal, for Stop. */
  readonly addr: Option.Option<string>;
}

export const readTitlebarProps = (props: unknown): TitlebarProps => {
  const f = fields(props);
  return { title: Option.getOrElse(text(f.title), () => "worktrunk"), addr: text(f.addr) };
};

/** The repo the New worktree dialog makes a worktree in: its main checkout. */
export const readNewProps = (props: unknown): Option.Option<string> => text(fields(props).main);

/** An overlay's props: its role, and what that role reads. */
type PropsOf<R extends Role, P> = { readonly role: R } & P;

/** A menu's props, for `openOverlay`; read back with `readMenuProps`. */
export const menuProps = (
  title: string,
  items: readonly MenuItem[],
): PropsOf<"menu", MenuProps> => ({ role: "menu", title, items });

/** A confirm dialog's props: the Action it guards; read back with `readConfirmProps`. */
export const confirmProps = (action: Action): PropsOf<"confirm", { readonly action: Action }> => ({
  role: "confirm",
  action,
});

/** A job window title bar's props; read back with `readTitlebarProps`. */
export const titlebarProps = (
  title: string,
  addr: string,
): PropsOf<"titlebar", { readonly title: string; readonly addr: string }> => ({
  role: "titlebar",
  title,
  addr,
});

/** The New worktree dialog's props: the repo's main checkout; read back with `readNewProps`. */
export const newProps = (main: string): PropsOf<"new", { readonly main: string }> => ({
  role: "new",
  main,
});

/** The settings file's text the Settings dialog opens on; null when there was no file. */
export const readSettingsText = (props: unknown): string | null =>
  Option.getOrNull(text(fields(props).text));

/** The Settings dialog's props: the file's text, null for none; read with `readSettingsText`. */
export const settingsProps = (
  text: string | null,
): PropsOf<"settings", { readonly text: string | null }> => ({ role: "settings", text });
