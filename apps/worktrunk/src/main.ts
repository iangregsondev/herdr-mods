// The worktrunk panel: your repos and their worktrees, from `wt list`, in a side panel,
// with the row and repo menus, the confirm and New worktree dialogs and the job window's
// title bar as overlays of the same mod. This file is the thin Herdr layer: it runs the
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
  hc,
  home,
  layout,
  notify,
  openOverlay,
  panes,
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
import { scanArgs } from "./commands.ts";
import { Files } from "./files.ts";
import { findModBlock, roleOf, type Role } from "./layout.ts";
import {
  findRepos,
  hideInSettings,
  loadSettings,
  newWorktree,
  readCi,
  readEach,
  readList,
  runJob,
  syncToast,
  type JobOutcome,
  type LoadedSettings,
} from "./load.ts";
import {
  ITEM_HEIGHT,
  busyNotice,
  cleanupAction,
  cleanupFor,
  confirmFor,
  dialogHeight,
  findWorktree,
  jobFor,
  menuHeight,
  repoMenu,
  rowMenu,
  type Action,
  type JobSpec,
  type MenuItem,
} from "./menus.ts";
import {
  askRefresh,
  ciDue,
  foldCi,
  foldList,
  IDLE,
  NO_READS,
  onRender,
  refreshDone,
  scanDue,
  type CiRead,
  type LastScan,
  type Loader,
  type RefreshAsk,
  type RepoList,
} from "./reads.ts";
import type { FoundRepo, Repo } from "./repos.ts";
import { DEFAULT_SETTINGS, lastSegment, type Settings } from "./settings.ts";
import { failureText, reveal, Shell, stopJob } from "./shell.ts";
import { localPlaces, spacesInGone, spacesOnWorktrees } from "./spaces.ts";
import {
  buildView,
  reposInGroup,
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
  menuProps,
  newProps,
  overlayOf,
  readConfirmProps,
  readFolded,
  readMenuProps,
  readNewProps,
  readRequest,
  readTitlebarProps,
  readViewState,
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
/** The selected group chip, view and toggle, remembered across restarts. */
const VIEW_KEY = `${__MOD_ID__}.view.v1`;
/** The record `vp run herdr:sync` writes in Herdr's folder: the Herdr version it built from. */
const SYNC_RECORD = `${__NAMESPACE__}-sync.json`;
/** The installed Herdr version the "run herdr:sync" toast was last shown for. */
const SYNC_TOLD_KEY = `${__MOD_ID__}.sync-told.v1`;
/** The mailbox: overlays (menus, dialogs) post an Action here for the panel to run. */
const REQUEST_KEY = `${__MOD_ID__}.request.v1`;
/** The job window's key, so a new job's window takes the old one's place. */
const JOB_WINDOW = `${__MOD_ID__}-job`;

const LIST_EVERY = 20_000;
const SCAN_EVERY = 10 * 60_000;
const CI_EVERY = 5 * 60_000;
/**
 * How many repos' lists, and CI, are read at once. Each read spawns processes, and Herdr
 * runs out of open files when every repo's start together.
 */
const LIST_LIMIT = 6;
const CI_LIMIT = 3;

/** Herdr's API, as the services call it. */
const services = Layer.mergeAll(
  Shell.layer({ exec, hc }),
  Files.layer({ readTextFile, writeTextFile }),
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
const button = (t: Colors, id: string, label: string, tone: ButtonTone, onClick: () => void) => {
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
  if (click._tag === "Select") run("space.select", { id: click.space });
  else run("space.new", { name: click.name, folder: click.folder });
};

const toggleFold = (key: string) => {
  const folded = readFolded(shared(FOLDED_KEY));
  setShared(FOLDED_KEY, { ...folded, [key]: !folded[key] });
};

/** A read whose defect, a bug, becomes its failed answer, so the panel shows it like any other. */
const defectAsFailure = <A>(
  read: Effect.Effect<Result.Result<A, string>, never, Shell | Files>,
): Effect.Effect<Result.Result<A, string>, never, Shell | Files> =>
  Effect.exit(read).pipe(
    Effect.map(
      Exit.match({
        onSuccess: (answer) => answer,
        onFailure: (cause) => Result.fail(Cause.pretty(cause)),
      }),
    ),
  );

/** Reads `read` for every root, a few at a time, handing each answer to `keep`. */
const readAll = (
  roots: readonly string[],
  limit: number,
  read: (root: string) => Effect.Effect<Result.Result<readonly Worktree[], string>, never, Shell>,
  keep: (root: string, answer: Result.Result<readonly Worktree[], string>) => void,
): Promise<void> =>
  runEdge(
    readEach(roots, limit, (root) => defectAsFailure(read(root)), keep),
    () => undefined,
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

/** Defers work out of `render`, which may not notify. */
const later = (cx: Context, fn: (cx: AsyncContext) => void) =>
  cx.spawn(async (cx) => {
    await cx.sleep(0);
    fn(cx);
  });

/** Shows one toast when Herdr has moved past the version the sync record names. */
const checkSync = async () => {
  const installed = updates().app.version;
  // A defect here is a bug in the check, not something to tell you about: no toast.
  const toast = await runEdge(
    syncToast(`${appHome()}/${SYNC_RECORD}`, installed, shared(SYNC_TOLD_KEY)),
    () => Option.none(),
  );
  Option.map(toast, (notice) => {
    setShared(SYNC_TOLD_KEY, installed);
    notify({ ...notice, level: "warning" });
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
  | { readonly _tag: "New"; readonly input: InputState }
  | { readonly _tag: "Titlebar" }
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
  /** The last folder scan's repos, and what and when it scanned. */
  scanned: Option.Option<readonly FoundRepo[]> = Option.none();
  lastScan: Option.Option<LastScan> = Option.none();
  repos: readonly Repo[] = [];
  discovered = false;
  discoverError: Option.Option<string> = Option.none();
  lists: ReadonlyMap<string, RepoList> = new Map();
  loader: Loader = IDLE;
  reads = NO_READS;
  ci: ReadonlyMap<string, CiRead> = new Map();
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

  init(_props: unknown, cx: AsyncContext) {
    // From props(), not init's argument: an overlay's props reach only props().
    const role = roleOf(ownProps());
    if (Option.isNone(role)) {
      this.copy = { _tag: "Unknown" };
      return;
    }
    if (role.value === "toggle") {
      this.copy = { _tag: "Toggle" };
      return;
    }
    if (role.value !== "panel") return this.initOverlay(cx, role.value);
    // A request left in shared state from an earlier run is never replayed.
    this.handled = Option.map(mailbox(), (request) => request.id);
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
      case "new": {
        const input = InputState.new({ placeholder: "branch name, pr:123, or a PR link" });
        input.on("submit", () => this.submitNew(input));
        input.focus();
        this.copy = { _tag: "New", input };
        return;
      }
    }
  }

  /** The New worktree dialog's Enter: asks the panel to switch to or create the branch. */
  submitNew(input: InputState) {
    const name = input.value().trim();
    Option.map(readNewProps(ownProps()), (main) => {
      if (name === "") return;
      closeSelf();
      send({ _tag: "Create", main, name, base: null });
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
          const hid = await runEdge(hideInSettings(settingsFile(), action.root), Result.fail);
          Result.match(hid, {
            onSuccess: () => undefined,
            onFailure: (body) =>
              notify({ title: "Couldn't hide the repo", body, level: "warning" }),
          });
          this.refresh(cx, { scan: false });
        });
        return;
      case "New":
        openOverlay({
          mod: __MOD_ID__,
          kind: "dialog",
          width: 460,
          height: 170,
          props: newProps(action.main),
        });
        return;
      case "Create":
        return this.createWorktree(cx, action.main, action.name, action.base);
      default:
        Option.map(jobFor(action, this.settings), (spec) => this.runJob(cx, spec));
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

  /** What every job does once it has ended: say why it never started, or close spaces. */
  jobEnded(cx: AsyncContext, title: string, outcome: JobOutcome) {
    if (outcome._tag === "NotStarted") {
      notify({ title: `Couldn't start: ${title}`, body: outcome.reason, level: "error" });
    } else {
      spacesInGone(spaces(), panes(), outcome.gone).forEach((id) =>
        run("space.close", { id, confirmed: true }),
      );
    }
    this.job = Option.none();
    cx.notify();
    this.refresh(cx, { scan: false });
  }

  /**
   * Runs `spec` as a terminal job in a floating window, one job at a time. The window
   * closes when the job ends; a failed job waits for Enter first, so it stays open with
   * its exit code. Then spaces on removed folders close and the list is read again.
   */
  runJob(cx: AsyncContext, spec: JobSpec) {
    if (this.busy()) return;
    this.job = Option.some(spec.title);
    cx.notify();
    cx.spawn(async (cx) => {
      const outcome = await runEdge(
        runJob(spec, (addr) => openJobWindow(spec.title, addr)),
        (defect): JobOutcome => ({ _tag: "NotStarted", reason: defect }),
      );
      this.jobEnded(cx, spec.title, outcome);
    });
  }

  /**
   * Switches to or creates the worktree for `name` as a job, then opens a space on it, or
   * selects the one already there.
   */
  createWorktree(cx: AsyncContext, main: string, name: string, base: string | null) {
    if (this.busy()) return;
    const title = `New worktree ${name}`;
    this.job = Option.some(title);
    cx.notify();
    cx.spawn(async (cx) => {
      const made = await runEdge(
        newWorktree({ main, name, base }, (addr) => openJobWindow(title, addr)),
        (defect) => ({
          outcome: { _tag: "NotStarted", reason: defect } satisfies JobOutcome,
          switched: Option.none(),
        }),
      );
      Option.map(made.switched, ({ branch, path }) =>
        Option.match(
          Option.fromNullishOr(spacesOnWorktrees(localPlaces(spaces(), panes()), [path]).get(path)),
          {
            onSome: (on) => run("space.select", { id: on.id }),
            onNone: () => run("space.new", { name: branch, folder: path }),
          },
        ),
      );
      this.jobEnded(cx, title, made.outcome);
    });
  }

  /** The repos the selected group chip shows: the only ones worth reading. */
  reposToRead(): readonly string[] {
    return reposInGroup({
      repos: this.repos,
      discovered: this.discovered,
      settings: this.settings,
      view: viewState(),
    }).map((repo) => repo.root);
  }

  /** CI for the repos shown, from `wt list --full`. A failed read keeps the CI from before. */
  checkCi(cx: AsyncContext) {
    if (this.checking || !this.discovered) return;
    this.checking = true;
    this.ciAt = Option.some(Date.now());
    cx.spawn(async (cx) => {
      await readAll(this.reposToRead(), CI_LIMIT, readCi, (root, read) => {
        const old = Option.fromNullishOr(this.ci.get(root));
        this.ci = new Map([...this.ci, [root, foldCi(old, read)]]);
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

  /** One refresh: the settings, then the repos, then the shown repos' worktrees. */
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
      }),
    );
    if (loaded.settled && !settled) setShared(IMPORTED_KEY, true);
    this.settings = loaded.parsed.settings;
    this.settingsError = loaded.parsed.error;

    const now = Date.now();
    const key = JSON.stringify(scanArgs(this.settings, home()));
    const due = scanDue(this.lastScan, { forced: scan, key, now, every: SCAN_EVERY });
    const places = localPlaces(spaces(), panes()).map((p) => p.place);
    const found = await runEdge(
      findRepos(this.settings, home(), places, due ? Option.none() : this.scanned),
      Result.fail,
    );
    if (Result.isSuccess(found)) {
      this.repos = found.success.repos;
      this.scanned = Option.some(found.success.scanned);
      if (due) this.lastScan = Option.some({ key, at: now });
      this.discoverError = Option.none();
    } else {
      // The repos from the last search that worked stay listed.
      this.discoverError = Option.some(found.failure);
    }
    this.discovered = true;
    cx.notify();

    await readAll(this.reposToRead(), LIST_LIMIT, readList, (root, read) => {
      const old = Option.fromNullishOr(this.lists.get(root));
      this.lists = new Map([...this.lists, [root, foldList(old, read)]]);
      cx.notify();
    });
  }

  /** Reads CI again with the next refresh, which `ask` starts. */
  refreshWithCi(cx: AsyncContext, ask: RefreshAsk) {
    this.ciAt = Option.none();
    this.refresh(cx, ask);
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

    const view = buildView({
      repos: this.repos,
      discovered: this.discovered,
      loading: this.loader._tag === "Loading",
      lists: this.lists,
      settings: this.settings,
      settingsError: this.settingsError,
      discoverError: this.discoverError,
      settingsFile: SETTINGS_FILE,
      spaces: spaces(),
      panes: panes(),
      folded: readFolded(shared(FOLDED_KEY)),
      ci: this.ci,
      view: state,
      search: this.search,
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

  worktreesOf(root: string): readonly Worktree[] {
    return Option.match(Option.fromNullishOr(this.lists.get(root)), {
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
    Option.map(findWorktree(this.lists, row.key), ({ root, worktree }) =>
      openMenu(row.label, rowMenu(root, worktree, row.click)),
    );
  }

  openRepoMenu(root: string) {
    openMenu(lastSegment(root), repoMenu(root, this.worktreesOf(root)));
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
        return this.renderNew(
          style,
          copy.input,
          Option.getOrElse(readNewProps(p), () => ""),
        );
      case "Menu":
        return this.renderMenu(style, readMenuProps(p), copy.menu);
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

  /** The New worktree dialog: a branch name or a wt shortcut, Enter to go. */
  renderNew({ t, sizes }: Style, input: InputState, main: string): Element {
    return this.focused(
      v_flex()
        .id("new")
        .size_full()
        .p(18)
        .gap(10)
        .bg(t.popover)
        .text_color(t.foreground)
        .text_size(sizes.body)
        .on_key_down((e) => {
          if (e.key === "escape") closeSelf();
        })
        .child(
          div()
            .text_size(sizes.title)
            .font_semibold()
            .child(`New worktree in ${lastSegment(main)}`),
        )
        .child(
          div()
            .h(32)
            .px(10)
            .flex()
            .items_center()
            .rounded(8)
            .border_1()
            .border_color(t.accent)
            .child(Input.new(input).h_full().text_color(t.foreground)),
        )
        .child(
          div()
            .text_size(sizes.label)
            .text_color(t.muted)
            .child("Enter creates it from the default branch, or switches to it if it exists."),
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

  /** Group chips, the view picker, the search box and the All repos / With worktrees toggle. */
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
                      .child(`Clean up all ${action.paths.length}`),
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
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => toggleFold(repo.key))
      .on_mouse_down("right", () => this.openRepoMenu(repo.key))
      .child(icon(repo.folded ? "chevron-right" : "chevron-down", 14, t.muted))
      .child(div().min_w(0).truncate().font_semibold().child(repo.name))
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
          cleanupAction([{ root: repo.key, worktrees: this.worktreesOf(repo.key) }]),
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
