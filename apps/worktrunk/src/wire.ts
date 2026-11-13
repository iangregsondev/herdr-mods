// What one copy of the mod hands another as plain data, read back into typed values: the
// view state and folded record in shared state, mailbox requests and overlay props.
// Shared state and props may hold anything (another mod's write, an older build's), so
// every reader checks the shape and leaves out what it can't read. Pure: no `herdr` or
// `gpui` imports.
import { Option, Predicate } from "effect";
import type { Batch, Linked, MergeMode } from "./commands.ts";
import {
  bool,
  fields,
  finite,
  listOf,
  SPACE_ACTS,
  text,
  textOrNull,
  type Role,
  type SpaceAct,
} from "worktrunk-mailbox";
import type { DialogMode, DialogProps } from "./dialog.ts";
import type { Located, Machine, RepoId } from "./machines.ts";
import { confirmFor, type Action, type Confirm, type MenuItem } from "./menus.ts";
import { DEFAULT_VIEW_STATE, SHOWS, type Click, type Show, type ViewState } from "./view.ts";

/** The view state as kept in shared state: plain JSON. */
export interface StoredViewState {
  readonly group: string | null;
  readonly show: Show;
  readonly only: boolean;
  /** The machine filter: null for All, else the machine in view (its name null for this one). */
  readonly machine: { readonly name: Machine } | null;
}

export const writeViewState = (state: ViewState): StoredViewState => ({
  group: Option.getOrNull(state.group),
  show: state.show,
  only: state.only,
  machine: Option.match(state.machine, { onNone: () => null, onSome: (name) => ({ name }) }),
});

const readShow = (value: unknown): Option.Option<Show> =>
  Option.fromNullishOr(SHOWS.find(([show]) => show === value)?.[0]);

/** A stored machine filter; anything but `{ name }` with a text or null name is All. */
const readMachineFilter = (value: unknown): Option.Option<Machine> => {
  const { name } = fields(value);
  return name === null || Predicate.isString(name) ? Option.some(name) : Option.none();
};

/** The view state kept in shared state; anything missing or unreadable is the default. */
export const readViewState = (value: unknown): ViewState => {
  const { group, show, only, machine } = fields(value);
  return {
    group: text(group),
    show: Option.getOrElse(readShow(show), () => DEFAULT_VIEW_STATE.show),
    only: Predicate.isBoolean(only) ? only : DEFAULT_VIEW_STATE.only,
    machine: readMachineFilter(machine),
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

const readAct = oneOf<SpaceAct>(SPACE_ACTS);

const readDialogMode = oneOf<DialogMode>(["new", "open"]);

/** The machine a value names; no machine named is this machine. */
const readMachine = (value: unknown): Machine => Option.getOrNull(text(value));

/** A folder, and the machine it is on. */
const readLocated = (value: unknown): Option.Option<Located> => {
  const f = fields(value);
  return Option.map(text(f.folder), (folder): Located => ({
    machine: readMachine(f.machine),
    folder,
  }));
};

/** A repo: its main checkout's folder, and the machine it is on. */
const readRepoId = (value: unknown): Option.Option<RepoId> => {
  const f = fields(value);
  return Option.map(text(f.root), (root): RepoId => ({ machine: readMachine(f.machine), root }));
};

const readClick = (value: unknown): Option.Option<Click> => {
  const f = fields(value);
  switch (f._tag) {
    case "Select":
      return Option.map(text(f.space), (space): Click => ({ _tag: "Select", space }));
    case "New":
      return Option.map(
        Option.all({ name: text(f.name), folder: text(f.folder) }),
        // No machine named is this machine.
        (click): Click => ({ _tag: "New", ...click, machine: readMachine(f.machine) }),
      );
    default:
      return Option.none();
  }
};

const readLinked = (value: unknown): Option.Option<Linked> => {
  const f = fields(value);
  return Option.map(
    Option.all({ main: text(f.main), path: text(f.path), branch: text(f.branch) }),
    (linked): Linked => ({ machine: readMachine(f.machine), ...linked }),
  );
};

const readBatch = (value: unknown): Option.Option<Batch> => {
  const f = fields(value);
  return Option.map(
    Option.all({
      main: text(f.main),
      branches: listOf(f.branches, text),
      paths: listOf(f.paths, text),
    }),
    (batch): Batch => ({ machine: readMachine(f.machine), ...batch }),
  );
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
          dirty: finite(f.dirty),
        }),
        (cleanup): Action => ({ _tag: "Cleanup", ...cleanup }),
      );
    case "SpaceWorktree":
      return Option.map(
        Option.all({ space: text(f.space), act: readAct(f.act) }),
        (request): Action => ({ _tag: "SpaceWorktree", ...request }),
      );
    case "NewOrOpen":
      return Option.map(textOrNull(f.folder), (folder): Action => ({ _tag: "NewOrOpen", folder }));
    case "GoTo":
      return Option.map(
        Option.all({ folder: text(f.folder), name: text(f.name) }),
        (go): Action => ({ _tag: "GoTo", ...go, machine: readMachine(f.machine) }),
      );
    case "NewOrOpenAt":
      return Option.map(readLocated(f.at), (at): Action => ({ _tag: "NewOrOpenAt", at }));
    case "Create":
      return Option.map(
        Option.all({ main: text(f.main), name: text(f.name), base: textOrNull(f.base) }),
        (create): Action => ({ _tag: "Create", ...create, machine: readMachine(f.machine) }),
      );
    case "CopyPath":
      return Option.map(text(f.path), (path): Action => ({ _tag: "CopyPath", path }));
    case "Reveal":
      return Option.map(text(f.path), (path): Action => ({ _tag: "Reveal", path }));
    case "Hide":
      return Option.map(
        Option.all({ machine: textOrNull(f.machine), root: text(f.root) }),
        (repo): Action => ({ _tag: "Hide", ...repo }),
      );
    case "Refresh":
      return Option.some({ _tag: "Refresh" });
    case "Settings":
      return Option.some({ _tag: "Settings" });
    case "Focus":
      return Option.some({ _tag: "Focus" });
    case "PickMachine":
      return f.machine === null
        ? Option.some({ _tag: "PickMachine", machine: null })
        : Option.map(readMachineFilter(f.machine), (name): Action => ({
            _tag: "PickMachine",
            machine: { name },
          }));
    case "PickGroup":
      return Option.map(textOrNull(f.group), (group): Action => ({ _tag: "PickGroup", group }));

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
  return Option.all({
    label: text(f.label),
    danger: bool(f.danger),
    checked: bool(f.checked),
    action: readAction(f.action),
  });
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
  return { title: Option.getOrElse(text(f.title), () => "Worktrunk"), addr: text(f.addr) };
};

/** The New-or-open dialog's props read back; anything missing or mistyped is none. */
export const readDialogProps = (props: unknown): DialogProps => {
  const f = fields(props);
  return {
    mode: Option.getOrElse(readDialogMode(f.mode), (): DialogMode => "new"),
    repo: readRepoId(f.repo),
    branch: text(f.branch),
    repos: Array.isArray(f.repos)
      ? f.repos.flatMap((repo) => Option.toArray(readRepoId(repo)))
      : [],
  };
};

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

/** The New-or-open dialog's props as plain JSON; read back with `readDialogProps`. */
export const dialogProps = ({
  mode,
  repo,
  branch,
  repos,
}: DialogProps): PropsOf<
  "new",
  {
    readonly mode: DialogMode;
    readonly repo: RepoId | null;
    readonly branch: string | null;
    readonly repos: readonly RepoId[];
  }
> => ({
  role: "new",
  mode,
  repo: Option.getOrNull(repo),
  branch: Option.getOrNull(branch),
  repos,
});

/** The settings file's text the Settings dialog opens on; null when there was no file. */
export const readSettingsText = (props: unknown): string | null =>
  Option.getOrNull(text(fields(props).text));

/** The Settings dialog's props: the file's text, null for none; read with `readSettingsText`. */
export const settingsProps = (
  text: string | null,
): PropsOf<"settings", { readonly text: string | null }> => ({ role: "settings", text });
