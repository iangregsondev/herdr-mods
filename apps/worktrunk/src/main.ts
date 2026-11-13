// The worktrunk panel: your repos and their worktrees, from `wt list`, in a side panel,
// with the row and repo menus, the confirm, New-or-open and Settings dialogs and the job
// window's title bar as overlays of the same mod. This file is the thin Herdr layer: it runs the
// Effect programs in load.ts at the edge, keeps what they return and draws what the pure
// builders (view.ts, menus.ts) return.
import {
  View,
  div,
  svg,
  type AsyncContext,
  type Context,
  type Element,
  type FocusHandle,
} from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import {
  appHome,
  closeOverlay,
  exec,
  focused,
  hc,
  home,
  layout,
  machines,
  nextCommand,
  notify,
  openOverlay,
  panes,
  pickFolder,
  props,
  readTextFile,
  run,
  setShared,
  settings as appSettings,
  shared,
  spaces,
  theme,
  updates,
  writeTextFile,
} from "herdr";
import { Cause, Effect, Exit, Layer, Option, Result } from "effect";
import {
  flippedBase,
  highlight,
  dialogCopy,
  dialogTitle,
  linesFor,
  moved,
  openDialog,
  repoHint,
  pick,
  retyped,
  withRead,
  type Base,
  type DialogMode,
  type DialogState,
  type Line,
} from "./dialog.ts";
import {
  Files,
  findModBlock,
  groupsKey,
  requestKey,
  roleOf,
  type Role,
  type SpaceAct,
} from "worktrunk-mailbox";
import { actionFor, copiesIn, handledAtStart, noticeFor, routeCommand } from "./keys.ts";
import {
  addGroupFolderOn,
  dialogFor,
  foundOf,
  landSearch,
  machinesOf,
  refreshMachines,
  type MachinesAsk,
  type Searches,
  hideInSettings,
  loadSettings,
  lookUpCurrent,
  newWorktree,
  pickGroupFolder,
  readCi,
  readDialogRepo,
  readEach,
  defectAsReason,
  runJob,
  saveSettings,
  scanKey,
  settingsText,
  spaceWorktree,
  syncToast,
  type JobOutcome,
  type LoadedSettings,
  type Scanned,
} from "./load.ts";
import {
  ITEM_HEIGHT,
  busyNotice,
  cleanupAction,
  cleanupCount,
  cleanupFor,
  confirmFor,
  dialogHeight,
  findWorktree,
  jobsFor,
  spaceStep,
  menuHeight,
  repoMenu,
  rowMenu,
  type Action,
  type CreateAction,
  type JobSpec,
  type MenuItem,
} from "./menus.ts";
import {
  askRefresh,
  ciDue,
  currentRepoOf,
  foldCi,
  keepLists,
  followFocus,
  IDLE,
  NO_READS,
  NOT_FOLLOWING,
  onRender,
  refreshDone,
  scanDue,
  takeLookup,
  type CiRead,
  type CurrentRepo,
  type Follow,
  type LastScan,
  type Loader,
  type RefreshAsk,
  type RepoList,
} from "./reads.ts";
import {
  locatedLabel,
  repoKey,
  repoOfKey,
  type RepoKey,
  THIS_MACHINE,
  type Homes,
  machineStates,
  type Located,
  type Machine,
  type MachineStatus,
  type RepoId,
} from "./machines.ts";
import type { Repo } from "./repos.ts";
import {
  DEFAULT_SETTINGS,
  addFolder,
  lastSegment,
  moveFolder,
  otherMachines,
  parseSettings,
  removeFolder,
  skipText,
  tildePath,
  unhide,
  withFields,
  type Settings,
} from "./settings.ts";
import { failureText, reveal, Shell, stopJob } from "./shell.ts";
import {
  clickCommand,
  focusedOrHere,
  groupsChanged,
  goTo,
  spaceGroups,
  spacePlaces,
  spacesInGone,
} from "./spaces.ts";
import {
  buildView,
  reposToRead,
  type CiBadge,
  type Click,
  type PanelView,
  type RepoView,
  type RowView,
  type SectionView,
  type Tone,
  type ViewState,
} from "./view.ts";
import type { Worktree } from "./worktrees.ts";
import {
  confirmProps,
  dialogProps,
  menuProps,
  overlayOf,
  readConfirmProps,
  readDialogProps,
  readFolded,
  readMenuProps,
  readRequest,
  readSettingsText,
  readTitlebarProps,
  readViewState,
  settingsProps,
  titlebarProps,
  writeViewState,
  type ConfirmProps,
  type MenuProps,
  type Request,
  type TitlebarProps,
} from "./wire.ts";

type Hex = `#${string}`;
type Colors = Record<string, Hex>;

const SETTINGS_FILE = `${__MOD_ID__}.json`;
/** The old third-party mod's settings, copied once into ours and never written. */
const LEGACY_FILE = "worktrunk.json";
/** True once the old mod's settings were imported, or a settings file made that moot. */
const IMPORTED_KEY = `${__MOD_ID__}.imported.v1`;
/** Folded repos and groups, remembered across restarts. */
const FOLDED_KEY = `${__MOD_ID__}.folded.v1`;
/** The machine filter, selected group chip, view and toggle, remembered across restarts. */
const VIEW_KEY = `${__MOD_ID__}.view.v1`;
/** The record `vp run herdr:sync` writes in Herdr's folder: the Herdr version it built from. */
const SYNC_RECORD = `${__NAMESPACE__}-sync.json`;
/** The installed Herdr version the "run herdr:sync" toast was last shown for. */
const SYNC_TOLD_KEY = `${__MOD_ID__}.sync-told.v1`;
/** The mailbox: overlays (menus, dialogs) post an Action here for the panel to run. */
const REQUEST_KEY = requestKey(__MOD_ID__);
/** Each space's group, by space id, for the menus mod's sidebar labels. */
const GROUPS_KEY = groupsKey(__MOD_ID__);
/** The job window's key, so a new job's window takes the old one's place. */
const JOB_WINDOW = `${__MOD_ID__}-job`;

const LIST_EVERY = 20_000;
const SCAN_EVERY = 10 * 60_000;
const CI_EVERY = 5 * 60_000;
/**
 * How many repos' CI is read at once. Each read spawns processes, and Herdr runs out of
 * open files when every repo's start together. Lists need no limit: each machine's are
 * read in one batched run.
 */
const CI_LIMIT = 3;

/** Herdr's API, as the services call it. */
const services = Layer.mergeAll(
  Shell.layer({ exec, hc }),
  Files.layer({ readTextFile, writeTextFile, pickFolder, exec }),
);

/**
 * Runs a program at the edge. The programs never fail (load.ts turns every failure into
 * a value), so only a defect, a bug, is left: it becomes `onDefect`'s value, which the
 * panel shows like any other failure.
 */
const runEdge = <A>(
  program: Effect.Effect<A, never, Shell | Files>,
  onDefect: (text: string) => A,
): Promise<A> =>
  Effect.runPromiseExit(program.pipe(Effect.provide(services))).then(
    Exit.match({
      onSuccess: (value) => value,
      onFailure: (cause) => onDefect(Cause.pretty(cause)),
    }),
  );

const fontSizes = () => {
  const base = Number(appSettings().ui_font_size) || 13;
  return { title: base + 1, body: base + 0.5, small: base - 0.5, label: base - 1 };
};

/** What every part of the panel is drawn with: the theme's colours and the text sizes. */
interface Style {
  readonly t: Colors;
  readonly sizes: ReturnType<typeof fontSizes>;
}

const icon = (name: string, size: number, color: Hex): Element =>
  svg(`mods/${__MOD_ID__}/${name}.svg`).size(size).flex_none().text_color(color);

const dot = (color: Hex, size: number, hollow: boolean): Element =>
  hollow
    ? div().w(size).h(size).flex_none().rounded_full().border(1.5).border_color(color)
    : div().w(size).h(size).flex_none().rounded_full().bg(color);

/** A text button's look: `plain` on `raised`; `accent` or `danger` (red) for going ahead. */
type ButtonTone = "plain" | "accent" | "danger";

const BUTTON_COLORS: Readonly<Record<ButtonTone, (t: Colors) => readonly [Hex, Hex]>> = {
  plain: (t) => [t.raised, t.foreground],
  accent: (t) => [t.accent, t.accent_foreground],
  danger: (t) => [t.ansi1, t.solid_foreground],
};

/** The dialogs' text buttons. */
const button = (
  t: Colors,
  id: string,
  label: string,
  tone: ButtonTone,
  onClick: (event: unknown, cx: Context) => void,
) => {
  const [bg, fg] = BUTTON_COLORS[tone](t);
  return div()
    .id(id)
    .flex_none()
    .px(14)
    .py(5)
    .rounded(6)
    .cursor_pointer()
    .bg(bg)
    .text_color(fg)
    .when(tone === "plain", (el) => el.hover((s) => s.bg(t.hover)))
    .on_click(onClick)
    .child(label);
};

const toneColor = (t: Colors, tone: Tone): Hex =>
  ({ main: t.accent, merged: t.done, active: t.working, conflict: t.blocked })[tone];

const onClickRow = (click: Click) => {
  const { command, args } = clickCommand(click);
  run(command, args);
};

const toggleFold = (key: string) => {
  const folded = readFolded(shared(FOLDED_KEY));
  setShared(FOLDED_KEY, { ...folded, [key]: !folded[key] });
};

/**
 * Shows a refresh read's defect, a bug left after each answer's own is kept (one in the
 * code that keeps the answers), as a toast: the read never stops silently.
 */
const showDefect = (what: string) => (body: string) =>
  notify({ title: `Couldn't read ${what}`, body, level: "error" });

/**
 * Reads `read` for every repo's folder, a few at a time, handing each answer to `keep`
 * under the repo's `repoKey`.
 */
const readAll = (
  repos: readonly RepoId[],
  limit: number,
  read: (repo: RepoId) => Effect.Effect<Result.Result<readonly Worktree[], string>, never, Shell>,
  keep: (key: RepoKey, answer: Result.Result<readonly Worktree[], string>) => void,
): Promise<void> =>
  runEdge(
    readEach(
      repos,
      limit,
      (repo) => defectAsReason(read(repo)),
      (repo, answer) => keep(repoKey(repo), answer),
    ),
    showDefect("CI"),
  );

const viewState = (): ViewState => readViewState(shared(VIEW_KEY));

const setView = (change: Partial<ViewState>) =>
  setShared(VIEW_KEY, writeViewState({ ...viewState(), ...change }));

const ciIcon = (t: Colors, badge: CiBadge): readonly [string, Hex] => {
  switch (badge.status) {
    case "passed":
      return ["check", t.done];
    case "running":
      return ["ring", t.working];
    case "failed":
      return ["alert", t.ansi1];
    case "conflicts":
      return ["alert", t.blocked];
    case "unknown":
      return ["help", t.muted];
  }
};

/** One warning toast for each thing that went wrong around the job `title`. */
const jobProblems = (title: string, problems: readonly string[]) =>
  problems.forEach((body) => notify({ title, body, level: "warning" }));

/** Defers work out of `render`, which may not notify. */
const later = (cx: Context, fn: (cx: AsyncContext) => void) =>
  cx.spawn(async (cx) => {
    await cx.sleep(0);
    fn(cx);
  });

/**
 * Shows one toast when Herdr has moved past the version the sync record names, or says
 * the record couldn't be read (not marked as told, so a readable record still toasts).
 */
const checkSync = async () => {
  const installed = updates().app.version;
  const toast = await runEdge(
    syncToast(`${appHome()}/${SYNC_RECORD}`, installed, shared(SYNC_TOLD_KEY)),
    Result.fail,
  );
  Result.match(toast, {
    onFailure: (body) => notify({ title: "Couldn't check for herdr:sync", body, level: "warning" }),
    onSuccess: Option.map((notice) => {
      setShared(SYNC_TOLD_KEY, installed);
      notify({ ...notice, level: "warning" });
    }),
  });
};

/** This copy's props: the layout block's or the overlay's, `overlay` added for an overlay. */
const ownProps = (): unknown => props();

/** The request in the mailbox, if it holds one the panel can run. */
const mailbox = (): Option.Option<Request> => readRequest(shared(REQUEST_KEY));

/** Hands `action` to the panel; an overlay's own tasks end when it closes. */
const send = (action: Action) => setShared(REQUEST_KEY, { id: Date.now() + Math.random(), action });

/** Runs `action` through the panel, after asking first when it removes or merges. */
const ask = (action: Action) =>
  Option.match(confirmFor(action), {
    onNone: () => send(action),
    onSome: ({ lines }) =>
      openOverlay({
        mod: __MOD_ID__,
        kind: "dialog",
        width: 500,
        height: dialogHeight(lines.length),
        props: confirmProps(action),
      }),
  });

/** A right-click menu; its height comes from its items. */
const openMenu = (title: string, items: readonly MenuItem[]) =>
  openOverlay({
    mod: __MOD_ID__,
    kind: "popup",
    width: 250,
    height: menuHeight(items.length),
    props: menuProps(title, items),
  });

/** Closes this copy's own overlay. */
const closeSelf = () => Option.map(overlayOf(ownProps()), closeOverlay);

const settingsFile = () => ({ path: `${appHome()}/${SETTINGS_FILE}`, name: SETTINGS_FILE });

/** The New-or-open dialog's size; its list scrolls. */
const NEW_WIDTH = 540;
const NEW_HEIGHT = 440;

/** The New-or-open dialog: its state, and the box I type in (a repo name while I pick one). */
interface NewDialog {
  state: DialogState;
  input: InputState;
}

/** The Settings dialog's size; its body scrolls when the lists outgrow it. */
const SETTINGS_WIDTH = 620;
const SETTINGS_HEIGHT = 600;

/** What the Settings dialog edits: the settings, the file's text it opened on, its fields. */
interface SettingsDraft {
  settings: Settings;
  /** The file's text when the dialog opened; null when there was none. */
  readonly opened: string | null;
  /** Why the file can't be saved over (it didn't parse); none when it can. */
  readonly broken: Option.Option<string>;
  /** One name field per group folder, in the folders' order. */
  names: InputState[];
  readonly skip: InputState;
  /** The other machine a typed group folder is added on; none until one is picked. */
  machine: Option.Option<string>;
  /** The folder's path on that machine, as typed. */
  readonly typed: InputState;
  /** A typed folder's check is running on its machine. */
  checking: boolean;
  /** A save, a folder pick or a typed folder that didn't happen, and why. */
  note: string;
}

/** Shows the job's terminal in a floating window, under a title bar with a Stop button. */
const openJobWindow = (title: string, addr: string) =>
  openOverlay({
    kind: "window",
    key: JOB_WINDOW,
    width: 820,
    height: 460,
    layout: {
      type: "column",
      children: [
        {
          type: "block",
          size: { px: 34 },
          content: { mod: __MOD_ID__, props: titlebarProps(title, addr) },
        },
        { type: "block", content: { terminal: addr } },
      ],
    },
  });

/** Which copy of the mod this is, with the state only that copy keeps. */
type Copy =
  | { readonly _tag: "Panel" }
  | { readonly _tag: "Toggle" }
  | { readonly _tag: "Menu"; readonly menu: { selected: number } }
  | { readonly _tag: "Confirm" }
  | { readonly _tag: "New"; readonly dialog: NewDialog }
  | { readonly _tag: "Titlebar" }
  | { readonly _tag: "Settings"; readonly draft: SettingsDraft }
  /** Props naming a role this mod doesn't have: it draws nothing and does nothing. */
  | { readonly _tag: "Unknown" };

type OverlayCopy = Exclude<Copy, { readonly _tag: "Panel" | "Toggle" | "Unknown" }>;

/** The panel's block is shown; a copy with no block of its own (an overlay) counts as shown. */
const shown = (): boolean =>
  Option.match(findModBlock(layout(), __MOD_ID__), {
    onNone: () => true,
    onSome: (block) => !block.hidden,
  });

export default class Worktrunk extends View {
  copy: Copy = { _tag: "Panel" };
  settings: Settings = DEFAULT_SETTINGS;
  settingsError: Option.Option<string> = Option.none();
  /** The last folder scan's repos and missing group folders; `lastScan` says what and when. */
  scanned: Option.Option<Scanned> = Option.none();
  /** Each machine's latest search, which the repos are found from. */
  searches: Searches = new Map();
  /** The machines whose refresh is still running: a new refresh runs nothing there. */
  refreshing: ReadonlySet<Machine> = new Set();
  lastScan: Option.Option<LastScan> = Option.none();
  repos: readonly Repo[] = [];
  discovered = false;
  discoverError: Option.Option<string> = Option.none();
  lists: ReadonlyMap<RepoKey, RepoList> = new Map();
  /** The machines that can't be read now, and why; their repos aren't listed or read. */
  machineStatus: ReadonlyMap<Machine, MachineStatus> = new Map();
  loader: Loader = IDLE;
  reads = NO_READS;
  ci: ReadonlyMap<RepoKey, CiRead> = new Map();
  /** When the last CI read started; none makes the next refresh read CI too. */
  ciAt: Option.Option<number> = Option.none();
  checking = false;
  search = "";
  searchBox: Option.Option<InputState> = Option.none();
  /** The last mailbox request seen, so each runs once. */
  handled: Option.Option<number> = Option.none();
  /** The running job's title; one job at a time. */
  job: Option.Option<string> = Option.none();
  /** An overlay's keyboard. */
  handle: Option.Option<FocusHandle> = Option.none();
  /** The Current view following focus: the folder last looked up, and its repo. */
  follow: Follow = NOT_FOLLOWING;

  init(_props: unknown, cx: AsyncContext) {
    // From props(), not init's argument: an overlay's props reach only props().
    const role = roleOf(ownProps());
    if (Option.isNone(role)) {
      this.copy = { _tag: "Unknown" };
      return;
    }
    if (role.value === "toggle") {
      this.copy = { _tag: "Toggle" };
      return this.listenForCommands(cx);
    }
    if (role.value !== "panel") return this.initOverlay(cx, role.value);
    // A request left in shared state from an earlier run is never replayed; a fresh one is
    // the toggle copy handing on a command as it shows this panel for the first time.
    this.handled = handledAtStart(mailbox(), Date.now());
    this.listenForCommands(cx);
    const box = InputState.new({ placeholder: "Branch or repo" });
    box.on("change", (_event, cx) => {
      this.search = box.value();
      cx.notify();
    });
    this.searchBox = Option.some(box);
    cx.spawn(checkSync);
    cx.timer.every(LIST_EVERY, (cx) => {
      if (shown() && Option.isNone(this.job)) this.refresh(cx, { scan: false });
    });
  }

  /** Acts on `keys.json` commands (`iangregsondev-worktrunk.<command>`) sent to this copy. */
  listenForCommands(cx: AsyncContext) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        this.onCommand(cx, command);
        cx.notify();
      }
    });
  }

  /** Does what `routeCommand` says this copy does with `command`. */
  onCommand(cx: AsyncContext, command: string) {
    const role = this.copy._tag === "Toggle" ? "toggle" : "panel";
    const step = routeCommand(command, role, copiesIn(layout(), __MOD_ID__));
    switch (step._tag) {
      case "Run":
        return this.perform(cx, actionFor(step.command));
      case "ShowThen":
        run("layout.show", { id: step.id });
        return send(actionFor(step.command));
      case "Toggle":
        run("layout.toggle", { id: step.id });
        return;
      default:
        Option.map(noticeFor(step), (notice) => notify({ ...notice, level: "warning" }));
    }
  }

  /**
   * Opens the worktree dialog in `mode` for the repo `folder` is in, on its machine (none:
   * the focused folder), offering the branch that folder is on as a base. Outside every
   * repo, the dialog asks for one of the repos the panel lists, on any machine.
   */
  openNewOrOpen(cx: AsyncContext, folder: Option.Option<Located>, mode: DialogMode = "new") {
    const places = spacePlaces(spaces(), panes());
    const at = Option.getOrElse(folder, () => focusedOrHere(focused(), places));
    const listed = this.repos.map(({ machine, root }): RepoId => ({ machine, root }));
    cx.spawn(async () => {
      const opened = await runEdge(dialogFor(at, listed, mode), Result.fail);
      Result.match(opened, {
        onSuccess: (props) =>
          Option.match(props, {
            onNone: () =>
              notify({
                title: "No repo for a worktree",
                body: "Focus a terminal in a repo, or add your repo folders in Settings.",
                level: "warning",
              }),
            onSome: (props) =>
              openOverlay({
                mod: __MOD_ID__,
                kind: "dialog",
                width: NEW_WIDTH,
                height: NEW_HEIGHT,
                props: dialogProps(props),
              }),
          }),
        onFailure: (body) =>
          notify({ title: "Couldn't find the repo for a worktree", body, level: "warning" }),
      });
    });
  }

  /** An overlay takes the keyboard, and keeps the state only its role needs. */
  initOverlay(cx: AsyncContext, role: Exclude<Role, "panel" | "toggle">) {
    const handle = cx.focus_handle();
    handle.focus();
    this.handle = Option.some(handle);
    switch (role) {
      case "menu":
        this.copy = { _tag: "Menu", menu: { selected: 0 } };
        return;
      case "confirm":
        this.copy = { _tag: "Confirm" };
        return;
      case "titlebar":
        this.copy = { _tag: "Titlebar" };
        return;
      case "settings":
        this.copy = { _tag: "Settings", draft: this.initSettings() };
        return;
      case "new": {
        const state = openDialog(readDialogProps(ownProps()));
        const dialog: NewDialog = { state, input: this.newInput(() => dialog, state) };
        this.copy = { _tag: "New", dialog };
        Option.map(state.repo, (repo) => this.readDialogRepo(cx, dialog, repo));
        return;
      }
    }
  }

  /** A fresh, focused input for the dialog's step: a repo name while it asks for one, else a branch. */
  newInput(dialog: () => NewDialog, state: DialogState): InputState {
    const input = InputState.new({
      placeholder: dialogCopy(state).placeholder,
    });
    input.on("change", (_event, cx) => {
      dialog().state = retyped(dialog().state);
      cx.notify();
    });
    input.on("submit", (_event, cx) => {
      const { state, input } = dialog();
      const lines = linesFor(state, input.value());
      this.pickNew(cx, dialog(), Option.fromNullishOr(lines[highlight(state, lines)]));
    });
    input.focus();
    return input;
  }

  /** Reads the worktrees and branches of `repo` into the dialog's list. */
  readDialogRepo(cx: AsyncContext | Context, dialog: NewDialog, repo: RepoId) {
    cx.spawn(async (cx) => {
      const read = await runEdge(readDialogRepo(repo), (defect) => ({
        list: Result.fail(defect),
        branches: Result.succeed([]),
      }));
      dialog.state = withRead(dialog.state, read.list, read.branches);
      cx.notify();
    });
  }

  /** Enter or a click on a line: picks the repo, or hands the choice to the panel. */
  pickNew(cx: Context, dialog: NewDialog, line: Option.Option<Line>) {
    const picked = pick(dialog.state, line);
    switch (picked._tag) {
      case "ReadRepo":
        dialog.state = picked.state;
        dialog.input = this.newInput(() => dialog, picked.state);
        this.readDialogRepo(cx, dialog, picked.repo);
        cx.notify();
        return;
      case "Send":
        closeSelf();
        send(picked.action);
        return;
      case "Nothing":
        return;
    }
  }

  /** The Settings dialog starts from the file's text the panel read when it opened it. */
  initSettings(): SettingsDraft {
    const opened = readSettingsText(ownProps());
    const parsed = parseSettings(opened, SETTINGS_FILE);
    const skip = InputState.new({ placeholder: "node_modules, .cache" });
    skip.set_value(skipText(parsed.settings.skip));
    const draft: SettingsDraft = {
      settings: parsed.settings,
      opened,
      broken: parsed.error,
      names: [],
      skip,
      machine: Option.none(),
      typed: InputState.new({ placeholder: "~/code" }),
      checking: false,
      note: "",
    };
    this.nameFields(draft);
    return draft;
  }

  /** New name fields, one per folder, holding the draft's names. */
  nameFields(draft: SettingsDraft) {
    draft.names = draft.settings.folders.map((folder) => {
      const field = InputState.new({ placeholder: lastSegment(folder.path) });
      field.set_value(folder.name);
      return field;
    });
  }

  /** The draft's settings with what the fields hold now. */
  drafted(draft: SettingsDraft): Settings {
    return withFields(draft.settings, {
      names: draft.names.map((field) => field.value()),
      skip: draft.skip.value(),
      depth: draft.settings.depth,
    });
  }

  /** Applies `change` to the draft, keeping what the fields hold. */
  editDraft(draft: SettingsDraft, change: (settings: Settings) => Settings) {
    const before = draft.settings.folders;
    draft.settings = change(this.drafted(draft));
    if (draft.settings.folders !== before) this.nameFields(draft);
  }

  /** Adds a group folder picked in the system's folder picker. */
  pickGroupFolder(cx: Context, draft: SettingsDraft) {
    cx.spawn(async (cx) => {
      const picked = await runEdge(pickGroupFolder(), Result.fail);
      Result.match(picked, {
        onSuccess: (folder) =>
          Option.map(folder, (path) =>
            this.editDraft(draft, (settings) => addFolder(settings, path, home())),
          ),
        onFailure: (reason) => {
          draft.note = reason;
        },
      });
      cx.notify();
    });
  }

  /**
   * Adds the typed folder on the picked machine once a check there finds it. A folder
   * that isn't there, or a check that can't run, is the dialog's note; nothing is added.
   */
  addTypedFolder(cx: Context, draft: SettingsDraft, machine: string) {
    if (draft.checking) return;
    draft.checking = true;
    draft.note = "";
    const settings = this.drafted(draft);
    cx.spawn(async (cx) => {
      const added = await runEdge(
        addGroupFolderOn(settings, machine, draft.typed.value()),
        Result.fail,
      );
      draft.checking = false;
      Result.match(added, {
        onSuccess: (next) => {
          this.editDraft(draft, () => next);
          draft.typed.set_value("");
        },
        onFailure: (reason) => {
          draft.note = reason;
        },
      });
      cx.notify();
    });
  }

  /**
   * Saves the draft, never over a hand edit made since the dialog opened; then the panel
   * reads everything again and the dialog closes. A save that didn't happen says why.
   */
  saveSettings(cx: Context, draft: SettingsDraft) {
    // A typed folder still being checked would be lost: it joins the draft only once found.
    if (draft.checking) return;
    const settings = this.drafted(draft);
    cx.spawn(async (cx) => {
      const saved = await runEdge(
        saveSettings(settingsFile(), draft.opened, settings),
        Result.fail,
      );
      Result.match(saved, {
        onSuccess: (done) => {
          if (done === "Saved") send({ _tag: "Refresh" });
          closeSelf();
        },
        onFailure: (reason) => {
          draft.note = reason;
          cx.notify();
        },
      });
    });
  }

  /** Runs a request from the mailbox. Jobs and the settings file are the panel's work. */
  perform(cx: AsyncContext, action: Action) {
    switch (action._tag) {
      case "Open":
        return onClickRow(action.click);
      case "CopyPath":
        cx.write_to_clipboard(action.path);
        notify({ title: "Copied", body: action.path, level: "info", timeout: 2000 });
        return;
      case "Reveal":
        cx.spawn(async () => {
          const shown = await runEdge(
            reveal(action.path).pipe(
              Effect.match({
                onSuccess: () => Option.none<string>(),
                onFailure: (failed) => Option.some(failureText(failed)),
              }),
            ),
            Option.some,
          );
          Option.map(shown, (body) =>
            notify({ title: "Couldn't reveal it in the Finder", body, level: "warning" }),
          );
        });
        return;
      case "Refresh":
        return this.refreshWithCi(cx, { scan: true });
      case "Hide":
        cx.spawn(async (cx) => {
          const hid = await runEdge(
            hideInSettings(settingsFile(), { machine: action.machine, root: action.root }),
            Result.fail,
          );
          Result.match(hid, {
            onSuccess: () => undefined,
            onFailure: (body) =>
              notify({ title: "Couldn't hide the repo", body, level: "warning" }),
          });
          this.refresh(cx, { scan: false });
        });
        return;
      case "NewOrOpen":
        return this.openNewOrOpen(
          cx,
          Option.map(Option.fromNullishOr(action.folder), (folder): Located => ({
            machine: THIS_MACHINE,
            folder,
          })),
        );
      case "GoTo":
        return onClickRow(goTo(spacePlaces(spaces(), panes()), action));
      case "NewOrOpenAt":
        return this.openNewOrOpen(cx, Option.some(action.at));
      case "SpaceWorktree":
        return this.forSpace(cx, action.space, action.act);
      case "Focus":
        Option.map(this.searchBox, (box) => box.focus());
        return;
      case "Create":
        return this.createWorktree(cx, action);
      case "Settings":
        cx.spawn(async () => {
          const text = await runEdge(settingsText(settingsFile()), Result.fail);
          Result.match(text, {
            onSuccess: (opened) =>
              openOverlay({
                mod: __MOD_ID__,
                kind: "dialog",
                modal: true,
                width: SETTINGS_WIDTH,
                height: SETTINGS_HEIGHT,
                props: settingsProps(opened),
              }),
            onFailure: (body) =>
              notify({ title: "Couldn't open Settings", body, level: "warning" }),
          });
        });
        return;
      default:
        this.runJobs(cx, jobsFor(action, this.settings));
    }
  }

  /**
   * Acts on the worktree the space `space` sits on, as Herdr's space menu asks: the
   * New-or-open dialog for its repo, or a merge or remove of it, confirmed as from a row.
   */
  forSpace(cx: AsyncContext, space: string, act: SpaceAct) {
    const warn = (body: string) =>
      notify({ title: "No worktree to act on", body, level: "warning" });
    const step = spaceStep(spacePlaces(spaces(), panes()), space, act);
    switch (step._tag) {
      case "NoFolder":
        return warn("That space has no folder.");
      case "Dialog":
        return this.openNewOrOpen(cx, Option.some(step.at), step.mode);
      case "Act":
        cx.spawn(async () => {
          const asked = await runEdge(spaceWorktree(step.act, step.at), Result.fail);
          Result.match(asked, { onSuccess: ask, onFailure: warn });
        });
    }
  }

  /** Busy with another job: says so and gives true. */
  busy(): boolean {
    return Option.match(this.job, {
      onNone: () => false,
      onSome: (running) => {
        notify({ ...busyNotice(running), level: "warning" });
        return true;
      },
    });
  }

  /**
   * What every job does once it has ended: say why it never started, or close the spaces
   * on its removed folders (on its machine) and say what went wrong around it.
   */
  jobEnded(title: string, machine: Machine, outcome: JobOutcome) {
    if (outcome._tag === "NotStarted") {
      notify({ title: `Couldn't start: ${title}`, body: outcome.reason, level: "error" });
    } else {
      spacesInGone(spaces(), panes(), machine, outcome.gone).forEach((id) =>
        run("space.close", { id, confirmed: true }),
      );
      jobProblems(title, outcome.problems);
    }
  }

  /** No job runs any more: the panel says so and reads the list again. */
  jobsDone(cx: AsyncContext) {
    this.job = Option.none();
    cx.notify();
    this.refresh(cx, { scan: false });
  }

  /**
   * Runs `specs` one after another as terminal jobs, each in a floating window on its
   * machine, one job at a time. A window closes when its job ends; a failed job waits
   * for Enter first, so it stays open with its exit code. After each, spaces on its
   * removed folders close; after the last, the list is read again.
   */
  runJobs(cx: AsyncContext, specs: readonly JobSpec[]) {
    const [first] = specs;
    if (first === undefined || this.busy()) return;
    // Busy at once, so a request that comes before the first job starts waits its turn.
    this.job = Option.some(first.title);
    cx.notify();
    cx.spawn(async (cx) => {
      for (const spec of specs) {
        this.job = Option.some(spec.title);
        cx.notify();
        const outcome = await runEdge(
          runJob(spec, (addr) => openJobWindow(spec.title, addr)),
          (defect): JobOutcome => ({ _tag: "NotStarted", reason: defect }),
        );
        this.jobEnded(spec.title, spec.on, outcome);
      }
      this.jobsDone(cx);
    });
  }

  /**
   * Switches to or creates the worktree `create` asks for as a job on its repo's machine,
   * then opens a space on it there, or selects the one already there.
   */
  createWorktree(cx: AsyncContext, create: CreateAction) {
    if (this.busy()) return;
    const title = `Open or create ${create.name}`;
    this.job = Option.some(title);
    cx.notify();
    cx.spawn(async (cx) => {
      const made = await runEdge(
        newWorktree(create, (addr) => openJobWindow(title, addr)),
        (defect) => ({
          outcome: { _tag: "NotStarted", reason: defect } satisfies JobOutcome,
          switched: Option.none(),
          problems: [],
        }),
      );
      jobProblems(title, made.problems);
      // The job ran on the repo's machine, so the worktree it switched to is there.
      Option.map(made.switched, ({ branch, path }) =>
        onClickRow(
          goTo(spacePlaces(spaces(), panes()), {
            machine: create.machine,
            folder: path,
            name: branch,
          }),
        ),
      );
      this.jobEnded(title, create.machine, made.outcome);
      this.jobsDone(cx);
    });
  }

  /** The repos the view shows: the only ones worth reading. */
  reposToRead(): readonly RepoId[] {
    return reposToRead({
      repos: this.repos,
      discovered: this.discovered,
      settings: this.settings,
      view: viewState(),
      current: this.currentRepo(),
      machines: this.machineStatus,
    });
  }

  /** The Current repo, with its group; Looking while it is first being looked up. */
  currentRepo(): CurrentRepo {
    return currentRepoOf(
      this.follow.found,
      this.repos,
      this.settings.folders,
      Option.match(this.scanned, {
        onNone: (): Homes => new Map([[THIS_MACHINE, home()]]),
        onSome: (scanned) => scanned.homes,
      }),
    );
  }

  /**
   * While the Current view shows, looks up the focused folder's repo whenever the folder
   * changes. Herdr renders on every focus change, so this never polls.
   */
  followFocus(cx: Context, following: boolean) {
    const places = spacePlaces(spaces(), panes());
    const folder = focusedOrHere(focused(), places);
    const step = followFocus(this.follow, { following, folder });
    this.follow = step.follow;
    Option.map(step.lookUp, (folder) => later(cx, (cx) => this.lookUpCurrent(cx, folder)));
  }

  /** Looks up the repo of `folder`, on its machine; a new Current repo is read at once. */
  lookUpCurrent(cx: AsyncContext, folder: Located) {
    cx.spawn(async (cx) => {
      const answer = await runEdge(lookUpCurrent(folder), Result.fail);
      const taken = takeLookup(this.follow, folder, answer);
      this.follow = taken.follow;
      cx.notify();
      if (taken.refresh) this.refresh(cx, { scan: false });
    });
  }

  /** CI for the repos shown, from `wt list --full`. A failed read keeps the CI from before. */
  checkCi(cx: AsyncContext) {
    if (this.checking || !this.discovered) return;
    this.checking = true;
    this.ciAt = Option.some(Date.now());
    cx.spawn(async (cx) => {
      await readAll(this.reposToRead(), CI_LIMIT, readCi, (key, read) => {
        const old = Option.fromNullishOr(this.ci.get(key));
        this.ci = new Map([...this.ci, [key, foldCi(old, read)]]);
        cx.notify();
      });
      this.checking = false;
    });
  }

  refresh(cx: AsyncContext, ask: RefreshAsk) {
    const asked = askRefresh(this.loader, ask);
    this.loader = asked.loader;
    cx.notify();
    if (Option.isNone(asked.start)) return;
    const start = asked.start.value;
    cx.spawn(async (cx) => {
      await this.load(cx, start);
      const done = refreshDone(this.loader);
      this.loader = done.loader;
      cx.notify();
      if (ciDue(this.ciAt, { now: Date.now(), every: CI_EVERY })) this.checkCi(cx);
      if (Option.isSome(done.again)) this.refresh(cx, done.again.value);
    });
  }

  /**
   * One refresh: the settings, then each machine's repos and its shown repos' worktrees,
   * the machines side by side. It ends when this machine's part does.
   */
  async load(cx: AsyncContext, { scan }: RefreshAsk) {
    const settled = shared(IMPORTED_KEY) === true;
    const loaded = await runEdge(
      loadSettings(
        {
          path: `${appHome()}/${SETTINGS_FILE}`,
          name: SETTINGS_FILE,
          legacyPath: `${appHome()}/${LEGACY_FILE}`,
        },
        settled,
      ),
      (defect): LoadedSettings => ({
        parsed: { settings: DEFAULT_SETTINGS, error: Option.some(`${SETTINGS_FILE}: ${defect}`) },
        settled,
        leftover: Option.none(),
      }),
    );
    if (loaded.settled && !settled) setShared(IMPORTED_KEY, true);
    // The import happens once, so this toast shows once.
    Option.map(loaded.leftover, (body) =>
      notify({ title: "Old settings file left behind", body, level: "warning" }),
    );
    this.settings = loaded.parsed.settings;
    this.settingsError = loaded.parsed.error;

    const now = Date.now();
    const key = scanKey(this.settings);
    const due = scanDue(this.lastScan, { forced: scan, key, now, every: SCAN_EVERY });
    const places = spacePlaces(spaces(), panes()).map((p): Located => ({
      machine: p.machine,
      folder: p.place,
    }));
    const current = Option.flatten(Option.flatMap(this.follow.found, Result.getSuccess));
    const ask: MachinesAsk = {
      settings: this.settings,
      home: home(),
      places,
      last: this.searches,
      rescan: due,
      states: machineStates(machines()),
      busy: this.refreshing,
    };
    const started = machinesOf(this.settings, places).filter(
      (machine) => !this.refreshing.has(machine),
    );
    this.refreshing = new Set([...this.refreshing, ...started]);
    // The refresh is done once this machine's part is: another machine's carries on alone,
    // so this machine's next refresh never waits on it.
    await new Promise<void>((done) => {
      if (!started.includes(THIS_MACHINE)) done();
      cx.spawn(async (cx) => {
        await runEdge(
          refreshMachines(
            ask,
            (machine, search) => {
              const landed = landSearch(
                {
                  searches: this.searches,
                  error: this.discoverError,
                  statuses: this.machineStatus,
                },
                machine,
                search,
              );
              this.searches = landed.searches;
              this.discoverError = landed.error;
              this.machineStatus = landed.statuses;
              if (due && machine === THIS_MACHINE && Result.isSuccess(search)) {
                this.lastScan = Option.some({ key, at: now });
              }
              // The Current repo is listed even when no open space is in it.
              const found = foundOf(this.settings, ask.home, places, this.searches, current);
              this.repos = found.repos;
              this.scanned = Option.some(found.scanned);
              this.discovered = true;
              cx.notify();
              return this.reposToRead();
            },
            (machine, answer) => {
              const kept = keepLists(
                { lists: this.lists, machines: this.machineStatus },
                machine,
                answer,
              );
              this.lists = kept.lists;
              this.machineStatus = kept.machines;
              cx.notify();
            },
            (machine) => {
              this.refreshing = new Set([...this.refreshing].filter((at) => at !== machine));
              if (machine === THIS_MACHINE) done();
            },
          ),
          showDefect("the repos"),
        );
        this.discovered = true;
        cx.notify();
        done();
      });
    });
  }

  /** Reads CI again with the next refresh, which `ask` starts. */
  refreshWithCi(cx: AsyncContext, ask: RefreshAsk) {
    this.ciAt = Option.none();
    this.refresh(cx, ask);
  }

  /**
   * Publishes each space's group, on every machine, for the sidebar's labels. Only once
   * repos are found, so a start doesn't clear the labels, and only when it changed: every
   * mod renders again on a shared-state change.
   */
  publishGroups() {
    if (!this.discovered) return;
    const groups = spaceGroups(spacePlaces(spaces(), panes()), this.repos, this.lists);
    if (groupsChanged(groups, shared(GROUPS_KEY))) {
      setShared(GROUPS_KEY, groups);
    }
  }

  render(cx: Context) {
    // theme() is typed as plain strings, but the style methods want hex colours.
    const style: Style = { t: theme() as Colors, sizes: fontSizes() };
    const copy = this.copy;
    if (copy._tag === "Toggle") return this.renderToggle(style);
    if (copy._tag === "Unknown") return div();
    if (copy._tag !== "Panel") return this.renderOverlay(style, copy);
    const { t, sizes } = style;
    Option.map(
      Option.filter(mailbox(), (request) => !Option.contains(this.handled, request.id)),
      (request) => {
        this.handled = Option.some(request.id);
        later(cx, (cx) => this.perform(cx, request.action));
      },
    );
    const block = findModBlock(layout(), __MOD_ID__);
    const state = viewState();
    const group = Option.getOrElse(state.group, () => "");
    const rendered = onRender(this.reads, { shown: shown(), group });
    this.reads = rendered.reads;
    if (rendered.step === "Start") later(cx, (cx) => this.refresh(cx, { scan: false }));
    // Another group chip: its repos may not have been read yet, CI included.
    if (rendered.step === "NewGroup") {
      later(cx, (cx) => this.refreshWithCi(cx, { scan: false }));
    }
    this.followFocus(cx, shown() && state.show === "current");
    this.publishGroups();

    const view = buildView({
      repos: this.repos,
      discovered: this.discovered,
      loading: this.loader._tag === "Loading",
      lists: this.lists,
      settings: this.settings,
      settingsError: this.settingsError,
      discoverError: this.discoverError,
      missingFolders: Option.match(this.scanned, {
        onNone: () => [],
        onSome: (scan) => scan.missing,
      }),
      machines: this.machineStatus,
      settingsFile: SETTINGS_FILE,
      spaces: spaces(),
      panes: panes(),
      folded: readFolded(shared(FOLDED_KEY)),
      ci: this.ci,
      view: state,
      search: this.search,
      current: this.currentRepo(),
      now: Date.now(),
    });

    const iconButton = (id: string, name: string, onClick: (cx: Context) => void) =>
      h_flex()
        .id(id)
        .size(24)
        .justify_center()
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_event, cx) => onClick(cx))
        .child(icon(name, 14, t.muted));

    const header = h_flex()
      .h(42)
      .flex_none()
      .pl(14)
      .pr(8)
      .gap(6)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(icon("git", 16, t.accent))
      .child(div().flex_1().text_size(sizes.title).font_semibold().child("worktrunk"))
      .when(view.loading, (el) => el.child(icon("ring", 13, t.muted).spin(900)))
      .child(iconButton("new", "plus", () => send({ _tag: "NewOrOpen", folder: null })))
      .child(iconButton("settings", "settings", () => send({ _tag: "Settings" })))
      .child(
        iconButton("refresh", "sync", (cx) =>
          later(cx, (cx) => this.refreshWithCi(cx, { scan: true })),
        ),
      )
      .when(Option.isSome(block), (el) =>
        el.child(
          iconButton("close", "close", () =>
            Option.map(block, (b) => run("layout.hide", { id: b.id })),
          ),
        ),
      );

    return v_flex()
      .id("worktrunk")
      .size_full()
      .min_h(0)
      .overflow_hidden()
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(sizes.body)
      .child(header)
      .children(
        view.banners.map((text) =>
          div()
            .px(12)
            .py(6)
            .bg(t.selected)
            .text_size(sizes.label)
            .text_color(t.blocked)
            .child(text),
        ),
      )
      .child(this.renderControls(style, view))
      .child(
        div()
          .id("list")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .child(this.renderBody(style, view.body)),
      )
      .children(this.renderFooter(style));
  }

  /** The worktrees of the repo kept under `key` (its `repoKey`). */
  worktreesOf(key: RepoKey): readonly Worktree[] {
    return Option.match(Option.fromNullishOr(this.lists.get(key)), {
      onNone: () => [],
      onSome: (list) => list.worktrees,
    });
  }

  /** "Running: <job>" while a job runs. */
  renderFooter({ t, sizes }: Style): readonly Element[] {
    return Option.toArray(this.job).map((title) =>
      h_flex()
        .id("footer")
        .h(36)
        .flex_none()
        .px(12)
        .gap(8)
        .items_center()
        .border_t(1)
        .border_color(t.border)
        .text_size(sizes.label)
        .child(icon("ring", 13, t.working).spin(900))
        .child(div().min_w(0).truncate().text_color(t.muted).child(`Running: ${title}`)),
    );
  }

  openRowMenu(row: RowView) {
    Option.map(findWorktree(this.lists, row.key), ({ machine, root, worktree }) =>
      openMenu(row.label, rowMenu({ machine, root }, worktree, row.click)),
    );
  }

  /** The menu of the repo kept under `key` (its `repoKey`). */
  openRepoMenu(key: RepoKey) {
    const repo = repoOfKey(key);
    openMenu(lastSegment(repo.root), repoMenu(repo, this.worktreesOf(key)));
  }

  renderOverlay(style: Style, copy: OverlayCopy): Element {
    const p = ownProps();
    switch (copy._tag) {
      case "Titlebar":
        return this.renderTitlebar(style, readTitlebarProps(p));
      case "Confirm":
        return Option.match(readConfirmProps(p), {
          onNone: () => div(),
          onSome: (asked) => this.renderConfirm(style, asked),
        });
      case "New":
        return this.renderNew(style, copy.dialog);
      case "Menu":
        return this.renderMenu(style, readMenuProps(p), copy.menu);
      case "Settings":
        return this.renderSettings(style, copy.draft);
    }
  }

  /** The overlay's root takes the keyboard its handle was given. */
  focused(el: Element): Element {
    return Option.match(this.handle, { onNone: () => el, onSome: (h) => el.track_focus(h) });
  }

  renderMenu(
    { t, sizes }: Style,
    { title, items }: MenuProps,
    menu: { selected: number },
  ): Element {
    const choose = (item: MenuItem | undefined) =>
      Option.map(Option.fromNullishOr(item), (chosen) => {
        closeSelf();
        ask(chosen.action);
      });
    return this.focused(
      v_flex()
        .id("menu")
        .size_full()
        .p(6)
        .bg(t.popover)
        .text_color(t.foreground)
        .text_size(sizes.body)
        .on_key_down((e, cx) => {
          if (e.key === "down" || e.key === "up") {
            const step = e.key === "down" ? 1 : items.length - 1;
            menu.selected = (menu.selected + step) % Math.max(1, items.length);
            cx.notify();
          } else if (e.key === "enter") choose(items[menu.selected]);
          else if (e.key === "escape") closeSelf();
        })
        .child(
          div()
            .h(28)
            .px(8)
            .flex()
            .items_center()
            .truncate()
            .text_size(sizes.label)
            .text_color(t.muted)
            .child(title),
        )
        .children(
          items.map((item, i) =>
            h_flex()
              .id(`item-${i}`)
              .h(ITEM_HEIGHT)
              .flex_none()
              .px(8)
              .items_center()
              .rounded(6)
              .cursor_pointer()
              .text_color(item.danger ? t.ansi1 : t.foreground)
              .when(i === menu.selected, (el) => el.bg(t.hover))
              .hover((s) => s.bg(t.hover))
              .on_click(() => choose(item))
              .child(item.label),
          ),
        ),
    );
  }

  renderConfirm({ t, sizes }: Style, { confirm, action }: ConfirmProps): Element {
    const go = () => {
      closeSelf();
      send(action);
    };
    return this.focused(
      v_flex()
        .id("confirm")
        .size_full()
        .p(18)
        .gap(10)
        .bg(t.popover)
        .text_color(t.foreground)
        .text_size(sizes.body)
        .on_key_down((e) => {
          if (e.key === "enter") go();
          else if (e.key === "escape") closeSelf();
        })
        .child(div().text_size(sizes.title).font_semibold().child(confirm.title))
        .child(
          v_flex()
            .flex_1()
            .min_h(0)
            .gap(4)
            .text_color(t.muted)
            .children(confirm.lines.map((line) => div().child(line))),
        )
        .child(
          h_flex()
            .justify_end()
            .gap(8)
            .child(button(t, "cancel", "Cancel", "plain", closeSelf))
            .child(button(t, "go", confirm.go, confirm.danger ? "danger" : "accent", go)),
        ),
    );
  }

  /**
   * The New-or-open dialog: an input, the matching worktrees and branches (or repos, while
   * it asks for one), and the base a new branch starts from.
   */
  renderNew(style: Style, dialog: NewDialog): Element {
    const { t, sizes } = style;
    const { state } = dialog;
    const lines = linesFor(state, dialog.input.value());
    const at = highlight(state, lines);
    const picking = Option.isNone(state.repo);
    const copy = dialogCopy(state);
    const title = dialogTitle(state);
    const describe = (line: Line): readonly [string, string] => {
      switch (line._tag) {
        case "Repo":
          return [lastSegment(line.repo.root), repoHint(line.repo, home())];
        case "Worktree":
          return [line.branch, copy.worktreeHint(line.path)];
        case "Branch":
          return [line.name, line.remote ? "on origin: new worktree" : "branch: new worktree"];
        case "Typed":
          return [line.name, line.shortcut ? "ask wt" : "new branch"];
      }
    };
    const row = (line: Line, i: number) => {
      const [label, hint] = describe(line);
      return (
        h_flex()
          .id(`line-${i}`)
          .h(30)
          .flex_none()
          .px(8)
          .gap(8)
          .items_center()
          .rounded(6)
          .cursor_pointer()
          .when(i === at, (el) => el.bg(t.hover))
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.pickNew(cx, dialog, Option.some(line)))
          .child(
            line._tag === "Typed" && !line.shortcut
              ? icon("plus", 12, t.accent)
              : dot(line._tag === "Worktree" ? t.working : t.muted, 7, line._tag !== "Worktree"),
          )
          // The name keeps its room; the hint gives way first.
          .child(div().flex_none().max_w(300).truncate().child(label))
          .child(div().flex_1())
          .child(div().min_w(0).truncate().text_size(sizes.label).text_color(t.muted).child(hint))
      );
    };
    const baseOption = (key: Base, label: string) =>
      h_flex()
        .id(`base-${key}`)
        .h(24)
        .px(9)
        // A long branch name shortens; "Default branch" never does.
        .when(key === "default", (el) => el.flex_none())
        .min_w(0)
        .items_center()
        .rounded(12)
        .cursor_pointer()
        .border_1()
        .border_color(state.base === key ? t.accent : t.border)
        .bg(state.base === key ? t.selected : t.popover)
        .text_size(sizes.label)
        .text_color(state.base === key ? t.foreground : t.muted)
        .on_click((_e, cx) => {
          if (dialog.state.base !== key) dialog.state = flippedBase(dialog.state);
          cx.notify();
        })
        .child(div().min_w(0).truncate().child(label));
    const bases = [
      baseOption("default", "Default branch"),
      ...Option.toArray(state.current).map((branch) =>
        baseOption("current", `${branch} (the branch I'm on)`),
      ),
    ];
    return this.focused(
      v_flex()
        .id("new")
        .size_full()
        .p(18)
        .gap(10)
        .bg(t.popover)
        .text_color(t.foreground)
        .text_size(sizes.body)
        .on_key_down((e, cx) => {
          if (e.key === "escape") return closeSelf();
          if (e.key === "down" || e.key === "up") {
            dialog.state = moved(dialog.state, lines, e.key === "down" ? 1 : -1);
          } else if (e.key === "tab" && !picking) {
            dialog.state = flippedBase(dialog.state);
          } else return;
          cx.stop_propagation();
          cx.notify();
        })
        .child(div().text_size(sizes.title).font_semibold().child(title))
        .child(
          h_flex()
            .h(32)
            .flex_none()
            .px(10)
            .items_center()
            .rounded(8)
            .border_1()
            .border_color(t.accent)
            .child(Input.new(dialog.input).flex_1().min_w(0).h_full().text_color(t.foreground)),
        )
        .child(
          v_flex()
            .id("lines")
            .flex_1()
            .min_h(0)
            .overflow_y_scrollbar()
            .children(lines.map(row))
            .when(lines.length === 0, (el) =>
              el.child(div().p(8).text_size(sizes.small).text_color(t.muted).child(copy.empty)),
            ),
        )
        .children(
          Option.toArray(state.error).map((error) =>
            div().text_size(sizes.label).text_color(t.ansi1).child(error),
          ),
        )
        .when(copy.offersBase, (el) =>
          el.child(
            h_flex()
              .w_full()
              .min_w(0)
              .gap(6)
              .items_center()
              .child(
                div()
                  .flex_none()
                  .text_size(sizes.label)
                  .text_color(t.muted)
                  .child("New branch from"),
              )
              .children(bases),
          ),
        )
        .child(div().text_size(sizes.label).text_color(t.dim).child(copy.footer)),
    );
  }

  /**
   * The Settings dialog: group folders (name, order, remove, add), the scan's depth and
   * skip names, hidden repos to show again, and the no-wrapper setting.
   */
  renderSettings({ t, sizes }: Style, draft: SettingsDraft): Element {
    const { settings } = draft;
    const edit = (change: (settings: Settings) => Settings) => (_e: unknown, cx: Context) => {
      this.editDraft(draft, change);
      cx.notify();
    };
    const small = (
      id: string,
      label: string | Element,
      onClick: (e: unknown, cx: Context) => void,
    ) =>
      h_flex()
        .id(id)
        .size(24)
        .flex_none()
        .justify_center()
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .text_color(t.muted)
        .hover((s) => s.bg(t.hover))
        .on_click(onClick)
        .child(label);
    const field = (state: InputState, width: Option.Option<number>) => {
      const box = h_flex()
        .h(28)
        .px(8)
        .items_center()
        .rounded(6)
        .border_1()
        .border_color(t.border)
        .bg(t.input)
        .child(Input.new(state).flex_1().min_w(0).h_full().text_color(t.foreground));
      return Option.match(width, {
        onNone: () => box.flex_1().min_w(0),
        onSome: (w) => box.w(w).flex_none(),
      });
    };
    const heading = (text: string, hint: string) =>
      v_flex()
        .pt(6)
        .gap(2)
        .child(div().font_semibold().child(text))
        .child(div().text_size(sizes.label).text_color(t.muted).child(hint));
    const hint = (text: string) => div().text_size(sizes.small).text_color(t.muted).child(text);
    const folders = settings.folders.map((folder, i) =>
      h_flex()
        .gap(6)
        .items_center()
        .children(
          Option.toArray(Option.fromNullishOr(draft.names[i])).map((name) =>
            field(name, Option.some(150)),
          ),
        )
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .text_size(sizes.small)
            .text_color(t.muted)
            .child(locatedLabel({ machine: folder.machine, folder: folder.path })),
        )
        .child(
          small(
            `up-${i}`,
            "↑",
            edit((s) => moveFolder(s, i, -1)),
          ),
        )
        .child(
          small(
            `down-${i}`,
            "↓",
            edit((s) => moveFolder(s, i, 1)),
          ),
        )
        .child(
          small(
            `remove-${i}`,
            icon("close", 12, t.muted),
            edit((s) => removeFolder(s, i)),
          ),
        ),
    );
    const hidden = settings.hidden.map((repo, i) =>
      h_flex()
        .gap(8)
        .items_center()
        .child(div().flex_none().font_medium().child(lastSegment(repo.root)))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .text_size(sizes.small)
            .text_color(t.muted)
            .child(repoHint(repo, home())),
        )
        .child(
          button(
            t,
            `unhide-${i}`,
            "Show again",
            "plain",
            edit((s) => unhide(s, repo)),
          ),
        ),
    );
    const others = otherMachines(machines());
    const machineChips = others.map((machine) => {
      const on = Option.contains(draft.machine, machine);
      return h_flex()
        .id(`machine-${machine}`)
        .h(24)
        .px(9)
        .flex_none()
        .items_center()
        .rounded(12)
        .cursor_pointer()
        .border_1()
        .border_color(on ? t.accent : t.border)
        .bg(on ? t.selected : t.input)
        .text_size(sizes.label)
        .text_color(on ? t.foreground : t.muted)
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e: unknown, cx: Context) => {
          draft.machine = Option.some(machine);
          cx.notify();
        })
        .child(machine);
    });
    const check = div()
      .size(16)
      .flex_none()
      .rounded(4)
      .border_1()
      .border_color(settings.noWrapper ? t.accent : t.border)
      .bg(settings.noWrapper ? t.accent : t.input);
    const body = v_flex()
      .gap(8)
      .pr(6)
      .child(
        heading("Groups", "Each folder is scanned for repos and names a group, in this order."),
      )
      .children(folders)
      .when(folders.length === 0, (el) => el.child(hint("No group folders yet.")))
      .child(
        h_flex().child(
          button(t, "add-folder", "Add folder on this machine…", "plain", (_e, cx) =>
            this.pickGroupFolder(cx, draft),
          ),
        ),
      )
      .when(others.length > 0, (el) =>
        el
          .child(
            hint(
              "Or pick another machine, type the folder's path there (~ is its home) and add it.",
            ),
          )
          .child(h_flex().gap(6).flex_wrap().children(machineChips))
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .child(field(draft.typed, Option.none()))
              .child(
                Option.match(draft.machine, {
                  onNone: () => hint("Pick a machine first"),
                  onSome: (machine) =>
                    button(
                      t,
                      "add-typed",
                      draft.checking ? `Checking on ${machine}…` : `Add on ${machine}`,
                      "plain",
                      (_e, cx) => this.addTypedFolder(cx, draft, machine),
                    ),
                }),
              ),
          ),
      )
      .child(heading("Scan", "How deep to look for repos, and folder names never to enter."))
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(div().w(150).flex_none().child("Depth"))
          .child(
            small(
              "depth-less",
              "−",
              edit((s) => ({ ...s, depth: Math.max(1, s.depth - 1) })),
            ),
          )
          .child(div().w(20).flex_none().text_center().child(String(settings.depth)))
          .child(
            small(
              "depth-more",
              "+",
              edit((s) => ({ ...s, depth: Math.min(8, s.depth + 1) })),
            ),
          ),
      )
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(div().w(150).flex_none().child("Skip folders named"))
          .child(field(draft.skip, Option.none())),
      )
      .child(heading("Hidden repos", "Repos left out of the panel."))
      .children(hidden)
      .when(hidden.length === 0, (el) => el.child(hint("No hidden repos.")))
      .child(heading("Shell wrapper", "Your own wt shell function, if you have one."))
      .child(
        h_flex()
          .id("no-wrapper")
          .gap(8)
          .items_center()
          .cursor_pointer()
          .on_click(edit((s) => ({ ...s, noWrapper: !s.noWrapper })))
          .child(check)
          .child("Run merge, remove and clean up without my wt shell function"),
      );
    const note = Option.match(draft.broken, {
      onSome: (error) => `${error}. Fix the file by hand; Settings can't save over it.`,
      onNone: () => draft.note,
    });
    return this.focused(
      v_flex()
        .id("settings")
        .size_full()
        .p(18)
        .gap(10)
        .bg(t.popover)
        .text_color(t.foreground)
        .text_size(sizes.body)
        .on_key_down((e) => {
          if (e.key === "escape") closeSelf();
        })
        .child(div().text_size(sizes.title).font_semibold().child("worktrunk settings"))
        .child(div().id("settings-body").flex_1().min_h(0).overflow_y_scrollbar().child(body))
        .when(note !== "", (el) =>
          el.child(div().text_size(sizes.label).text_color(t.ansi1).child(note)),
        )
        .child(
          h_flex()
            .gap(8)
            .items_center()
            .child(
              div()
                .flex_1()
                .min_w(0)
                .text_size(sizes.label)
                .text_color(t.dim)
                .child(
                  `Saved in ${tildePath(settingsFile().path, home())}. You can edit it by hand too.`,
                ),
            )
            .child(button(t, "cancel", "Cancel", "plain", closeSelf))
            .when(Option.isNone(draft.broken), (el) =>
              el.child(
                button(t, "save", "Save", "accent", (_e, cx) => this.saveSettings(cx, draft)),
              ),
            ),
        ),
    );
  }

  /** The job window's title bar: what runs, and a Stop button. */
  renderTitlebar({ t, sizes }: Style, { title, addr }: TitlebarProps): Element {
    const stop = (terminal: string) =>
      runEdge(
        stopJob(terminal).pipe(
          Effect.match({
            onSuccess: () => Option.none<string>(),
            onFailure: (failed) => Option.some(failureText(failed)),
          }),
        ),
        Option.some,
      ).then((failed) =>
        Option.map(failed, (body) =>
          notify({ title: "Couldn't stop the job", body, level: "warning" }),
        ),
      );
    return h_flex()
      .id("titlebar")
      .size_full()
      .px(12)
      .gap(8)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .text_size(sizes.label)
      .child(icon("git", 14, t.accent))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(title))
      .child(div().text_color(t.dim).child("drag to move"))
      .child(
        div()
          .id("stop")
          .px(10)
          .py(3)
          .rounded(6)
          .cursor_pointer()
          .text_color(t.ansi1)
          .hover((s) => s.bg(t.hover))
          // The bar drags the window; a press on Stop must not.
          .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
          .on_click(() => Option.map(addr, stop))
          .child("Stop"),
      );
  }

  /**
   * The machine filter (with more than one machine), group chips, the view picker, the
   * search box and the All repos / With worktrees toggle.
   */
  renderControls({ t, sizes }: Style, view: PanelView): Element {
    const chip = (id: string, label: string, on: boolean, onClick: () => void) =>
      h_flex()
        .id(id)
        .h(24)
        .px(9)
        .flex_none()
        .items_center()
        .rounded(12)
        .cursor_pointer()
        .border_1()
        .border_color(on ? t.accent : t.border)
        .bg(on ? t.selected : t.background)
        .text_size(sizes.label)
        .text_color(on ? t.foreground : t.muted)
        .when(on, (el) => el.font_semibold())
        .hover((s) => s.text_color(t.foreground))
        .on_click(onClick)
        .child(label);
    const segment = (
      id: string,
      options: readonly { readonly key: string; readonly label: string; readonly on: boolean }[],
      onPick: (key: string) => void,
    ) =>
      h_flex()
        .id(id)
        .w_full()
        .p(2)
        .gap(2)
        .rounded(8)
        .bg(t.chrome)
        .border_1()
        .border_color(t.border)
        .children(
          options.map(({ key, label, on }) =>
            h_flex()
              .id(`${id}-${key}`)
              .flex_1()
              .min_w(0)
              .h(24)
              .justify_center()
              .items_center()
              .rounded(6)
              .bg(on ? t.raised : t.chrome)
              .text_size(sizes.label)
              .text_color(on ? t.foreground : t.muted)
              .when(on, (el) => el.font_semibold())
              .cursor_pointer()
              .hover((s) => s.text_color(t.foreground))
              .on_click(() => onPick(key))
              .child(div().truncate().child(label)),
          ),
        );
    const search = h_flex()
      .flex_1()
      .min_w(0)
      .h(28)
      .px(8)
      .gap(6)
      .items_center()
      .rounded(6)
      .border_1()
      .border_color(t.border)
      .bg(t.chrome)
      .child(icon("search", 13, t.muted))
      .children(
        Option.toArray(this.searchBox).map((box) =>
          Input.new(box).flex_1().min_w(0).h_full().text_size(sizes.small).text_color(t.foreground),
        ),
      );
    return v_flex()
      .flex_none()
      .px(12)
      .py(8)
      .gap(7)
      .border_b(1)
      .border_color(t.border)
      .when(view.machineFilter.length > 0, (el) =>
        el.child(
          segment(
            "machine",
            view.machineFilter.map((m, i) => ({ key: `${i}`, label: m.label, on: m.selected })),
            (key) =>
              Option.map(Option.fromNullishOr(view.machineFilter[Number(key)]), (picked) =>
                setView({ machine: picked.machine }),
              ),
          ),
        ),
      )
      .child(
        h_flex()
          .flex_wrap()
          .gap(5)
          .items_center()
          .children(
            view.chips.map((c) =>
              chip(`chip-${c.label}`, c.label, c.selected, () => setView({ group: c.group })),
            ),
          ),
      )
      .child(
        segment(
          "show",
          view.views.map((v) => ({ key: v.show, label: v.label, on: v.selected })),
          (key) =>
            Option.map(Option.fromNullishOr(view.views.find((v) => v.show === key)), (picked) =>
              setView({ show: picked.show }),
            ),
        ),
      )
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(search)
          .children(
            Option.toArray(view.toggle).map((only) =>
              h_flex()
                .w(190)
                .flex_none()
                .child(
                  segment(
                    "only",
                    [
                      { key: "all", label: "All repos", on: !only },
                      { key: "only", label: "With worktrees", on: only },
                    ],
                    (key) => setView({ only: key === "only" }),
                  ),
                ),
            ),
          ),
      );
  }

  renderBody(style: Style, body: PanelView["body"]): Element {
    const { t, sizes } = style;
    switch (body._tag) {
      case "Message":
        return div().p(16).text_size(sizes.small).text_color(t.muted).child(body.text);
      case "NotInRepo":
        return v_flex()
          .child(
            div()
              .px(14)
              .pt(12)
              .text_size(sizes.small)
              .font_semibold()
              .text_color(t.muted)
              .child(body.text),
          )
          .child(this.renderBody(style, body.open));
      case "Tree":
        return v_flex()
          .pb(16)
          .children(body.repos.map((repo) => this.renderRepo(style, repo)));
      case "Flat":
        return v_flex()
          .pt(6)
          .pb(16)
          .children(
            Option.toArray(body.summary).map((summary) =>
              h_flex()
                .px(14)
                .pt(4)
                .pb(4)
                .gap(8)
                .items_center()
                .text_size(sizes.label)
                .child(div().flex_1().min_w(0).font_semibold().text_color(t.done).child(summary))
                .children(
                  Option.toArray(
                    cleanupFor(
                      this.lists,
                      body.rows.map((row) => row.key),
                    ),
                  ).map((action) =>
                    div()
                      .id("cleanup-all")
                      .flex_none()
                      .px(8)
                      .py(2)
                      .rounded(6)
                      .cursor_pointer()
                      .text_color(t.ansi1)
                      .hover((s) => s.bg(t.hover))
                      .on_click(() => ask(action))
                      .child(`Clean up all ${cleanupCount(action)}`),
                  ),
                ),
            ),
          )
          .children(body.rows.map((row) => this.renderRow(style, row)));
    }
  }

  /** The tab-bar button: shows and hides the panel's block. */
  renderToggle({ t, sizes }: Style): Element {
    const block = findModBlock(layout(), __MOD_ID__);
    const on = Option.exists(block, (b) => !b.hidden);
    return h_flex()
      .size_full()
      .pr(10)
      .items_center()
      .justify_end()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .id("toggle")
          .h(26)
          .px(8)
          .gap(5)
          .flex_none()
          .items_center()
          .rounded(6)
          .text_size(sizes.label)
          .bg(on ? t.selected : t.chrome)
          .text_color(on ? t.foreground : t.muted)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          // The block drags the window; a press on the button must not.
          .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
          .on_click(() => Option.map(block, (b) => run("layout.toggle", { id: b.id })))
          .child(icon("git", 14, on ? t.foreground : t.muted))
          .child("worktrunk"),
      );
  }

  renderRepo({ t, sizes }: Style, repo: RepoView): Element {
    const head = h_flex()
      .id(`repo-${repo.key}`)
      .min_h(36)
      .px(10)
      .mt(6)
      .gap(8)
      .items_center()
      .when(repo.foldable, (el) =>
        el
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click(() => toggleFold(repo.key)),
      )
      .on_mouse_down("right", () => this.openRepoMenu(repo.key))
      .child(icon(repo.folded ? "chevron-right" : "chevron-down", 14, t.muted))
      .child(div().min_w(0).truncate().font_semibold().child(repo.name))
      .children(
        Option.toArray(repo.machine).map((machine) =>
          div()
            .flex_none()
            .px(6)
            .rounded(4)
            .border(1)
            .border_color(t.border)
            .text_size(sizes.label - 1)
            .text_color(t.muted)
            .child(machine),
        ),
      )
      .children(
        Option.toArray(repo.group).map((group) =>
          div()
            .flex_none()
            .px(6)
            .rounded(4)
            .bg(t.chrome)
            .text_size(sizes.label - 1)
            .text_color(t.dim)
            .child(group),
        ),
      )
      .child(div().flex_1())
      .children(
        Option.toArray(
          cleanupAction([{ ...repoOfKey(repo.key), worktrees: this.worktreesOf(repo.key) }]),
        ).map((action) =>
          div()
            .id(`cleanup-${repo.key}`)
            .flex_none()
            .px(6)
            .rounded(4)
            .text_size(sizes.label)
            .text_color(t.done)
            .hover((s) => s.bg(t.raised))
            .on_click((_event, cx) => {
              cx.stop_propagation();
              ask(action);
            })
            .child("Clean up"),
        ),
      )
      .child(
        div()
          .flex_none()
          .text_size(sizes.label)
          .text_color(t.muted)
          .child(Option.match(repo.count, { onNone: () => "…", onSome: String })),
      );
    const note = (text: string, color: Hex) =>
      div().px(16).py(4).text_size(sizes.small).text_color(color).child(text);
    const status =
      repo.folded || repo.status._tag === "Ok"
        ? []
        : repo.status._tag === "Reading"
          ? [note("Reading…", t.muted)]
          : [note(repo.status.text, t.ansi1)];
    const ciNote = repo.folded
      ? []
      : Option.toArray(repo.ciNote).map((text) => note(text, t.muted));
    const style = { t, sizes };
    return v_flex()
      .child(head)
      .children(status)
      .children(ciNote)
      .children(repo.main.map((row) => this.renderRow(style, row)))
      .children(repo.sections.map((section) => this.renderSection(style, section)));
  }

  renderSection(style: Style, section: SectionView): Element {
    const { t, sizes } = style;
    const color =
      section.kind === "merged" ? t.done : section.kind === "conflict" ? t.blocked : t.muted;
    return v_flex()
      .child(
        h_flex()
          .id(`group-${section.key}`)
          .min_h(26)
          .pl(18)
          .pr(10)
          .pt(6)
          .gap(6)
          .items_center()
          .cursor_pointer()
          .on_click(() => toggleFold(section.key))
          .child(icon(section.folded ? "chevron-right" : "chevron-down", 12, color))
          .child(
            div()
              .flex_1()
              .text_size(sizes.label)
              .font_semibold()
              .text_color(color)
              .child(`${section.label} · ${section.count}`),
          ),
      )
      .children(section.rows.map((row) => this.renderRow(style, row)));
  }

  renderRow({ t, sizes }: Style, row: RowView): Element {
    return h_flex()
      .id(`row-${row.key}`)
      .min_h(40)
      .mx(6)
      .pl(22)
      .pr(8)
      .py(4)
      .gap(9)
      .items_center()
      .rounded(7)
      .cursor_pointer()
      .when(row.current, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click(() => onClickRow(row.click))
      .on_mouse_down("right", () => this.openRowMenu(row))
      .child(dot(toneColor(t, row.tone), 8, row.hollow))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .child(div().min_w(0).truncate().font_medium().child(row.label))
              .children(
                Option.toArray(row.badge).map((word) =>
                  div()
                    .flex_none()
                    .px(5)
                    .rounded(4)
                    .bg(t.hover)
                    .text_size(sizes.label)
                    .text_color(t.working)
                    .child(word),
                ),
              )
              .when(row.dirty, (el) => el.child(dot(t.blocked, 6, false))),
          )
          .child(div().truncate().text_size(sizes.label).text_color(t.muted).child(row.subline)),
      )
      .children(
        Option.toArray(row.ci).map((badge) => {
          const [name, color] = ciIcon(t, badge);
          // Checks on an older commit than the one pushed: shown, but dimmed.
          const drawn = icon(name, 13, badge.stale ? t.dim : color);
          return badge.status === "running" ? drawn.spin(1200) : drawn;
        }),
      )
      .when(row.open, (el) =>
        el.child(div().flex_none().text_size(sizes.label).text_color(t.muted).child("open")),
      );
  }
}
