import { Option } from "effect";
import { THIS_MACHINE } from "../src/machines.ts";
import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_VIEW_STATE } from "../src/view.ts";
import { confirmFor, repoMenu, rowMenu } from "../src/menus.ts";
import { roleOf, SPACE_ACTS } from "worktrunk-mailbox";
import {
  confirmProps,
  dialogProps,
  menuProps,
  overlayOf,
  readAction,
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
} from "../src/wire.ts";
import type { Worktree, WorktreeState } from "../src/worktrees.ts";

const wt = (
  path: string,
  branch: string | null,
  state: WorktreeState,
  dirty = false,
): Worktree => ({
  branch: Option.fromNullishOr(branch),
  path,
  state,
  ahead: 0,
  behind: 0,
  added: 0,
  deleted: 0,
  upstream: Option.none(),
  dirty,
  ci: { _tag: "NotAsked" },
  committedAt: Option.none(),
});

const MAIN = wt("/r/app", "main", { _tag: "Main" });
const FEAT = wt("/r/app.feat", "feat", { _tag: "Active" }, true);
const DONE = wt("/r/app.done", "done", { _tag: "Merged", reason: Option.none() });
const DETACHED = wt("/r/app.x", null, { _tag: "Active" });

/** As it arrives from shared state or props: plain JSON. */
const overTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const actionsOf = (items: readonly { readonly action: unknown }[]) => items.map((i) => i.action);

describe("readFolded", () => {
  test("keeps the true and false entries only", () => {
    expect(readFolded({ "/r/app": true, "/r/app|merged": false, odd: "yes" })).toEqual({
      "/r/app": true,
      "/r/app|merged": false,
    });
  });

  test("anything but an object is nothing folded", () => {
    expect(readFolded(undefined)).toEqual({});
    expect(readFolded([true])).toEqual({});
  });
});

describe("view state", () => {
  test("defaults: All groups, the Repos view, only repos with worktrees, All machines", () => {
    expect(DEFAULT_VIEW_STATE).toEqual({
      group: Option.none(),
      show: "repos",
      only: true,
      machine: Option.none(),
    });
  });

  test("survives a round trip through shared state", () => {
    const state = {
      group: Option.some("Work"),
      show: "merged",
      only: false,
      machine: Option.none(),
    } as const;
    const stored: unknown = JSON.parse(JSON.stringify(writeViewState(state)));
    expect(readViewState(stored)).toEqual(state);
    const defaults: unknown = JSON.parse(JSON.stringify(writeViewState(DEFAULT_VIEW_STATE)));
    expect(readViewState(defaults)).toEqual(DEFAULT_VIEW_STATE);
  });

  test("nothing stored, or something unreadable, gives the defaults field by field", () => {
    expect(readViewState(undefined)).toEqual(DEFAULT_VIEW_STATE);
    expect(readViewState("repos")).toEqual(DEFAULT_VIEW_STATE);
    expect(readViewState({ group: 3, show: "nope", only: "yes" })).toEqual(DEFAULT_VIEW_STATE);
    expect(readViewState({ show: "open" })).toEqual({ ...DEFAULT_VIEW_STATE, show: "open" });
    expect(readViewState({ machine: { name: 3 } })).toEqual(DEFAULT_VIEW_STATE);
  });

  test("a machine filter survives a round trip, this machine and another alike", () => {
    const roundTrip = (machine: Option.Option<string | null>) => {
      const state = { ...DEFAULT_VIEW_STATE, machine };
      const stored: unknown = JSON.parse(JSON.stringify(writeViewState(state)));
      return readViewState(stored).machine;
    };
    expect(roundTrip(Option.some("linux"))).toEqual(Option.some("linux"));
    expect(roundTrip(Option.some(null))).toEqual(Option.some(null));
  });

  test("the Current view is remembered like the others", () => {
    const state = { ...DEFAULT_VIEW_STATE, show: "current" } as const;
    const stored: unknown = JSON.parse(JSON.stringify(writeViewState(state)));
    expect(readViewState(stored)).toEqual(state);
  });
});

describe("readAction", () => {
  test.each([
    ...actionsOf(
      rowMenu({ machine: THIS_MACHINE, root: "/r/app" }, FEAT, {
        _tag: "New",
        name: "feat",
        folder: "/r/app.feat",
        machine: THIS_MACHINE,
      }),
    ),
    ...actionsOf(
      rowMenu({ machine: "linux", root: "/r/app" }, FEAT, {
        _tag: "New",
        name: "feat",
        folder: "/r/app.feat",
        machine: "linux",
      }),
    ),
    ...actionsOf(
      rowMenu({ machine: THIS_MACHINE, root: "/r/app" }, DETACHED, { _tag: "Select", space: "s1" }),
    ),
  ])("reads back the row menu's $_tag action as it was sent", (action) => {
    expect(readAction(overTheWire(action))).toEqual(Option.some(action));
  });

  test("a Merge or Remove target that names no machine is on this machine", () => {
    const target = { main: "/r/app", path: "/r/app.feat", branch: "feat" };
    expect(readAction({ _tag: "Remove", target, dirty: false })).toEqual(
      Option.some({ _tag: "Remove", target: { ...target, machine: THIS_MACHINE }, dirty: false }),
    );
  });

  test.each([
    { _tag: "Create", main: "/r/app", name: "feat", base: null, machine: THIS_MACHINE },
    { _tag: "Create", main: "/r/app", name: "feat", base: "main", machine: THIS_MACHINE },
    { _tag: "Create", main: "/srv/app", name: "feat", base: null, machine: "linux" },
  ] as const)("reads back a Create with base $base on machine $machine", (action) => {
    expect(readAction(overTheWire(action))).toEqual(Option.some(action));
  });

  test.each([
    { _tag: "GoTo", machine: THIS_MACHINE, folder: "/r/app.feat", name: "feat" },
    { _tag: "GoTo", machine: "linux", folder: "/srv/app.feat", name: "feat" },
  ] as const)(
    "reads back a GoTo on machine $machine, as the worktree picker sends it",
    (action) => {
      expect(readAction(overTheWire(action))).toEqual(Option.some(action));
    },
  );

  test("a Create that names no machine is on this machine", () => {
    expect(readAction({ _tag: "Create", main: "/r/app", name: "feat", base: null })).toEqual(
      Option.some({
        _tag: "Create",
        main: "/r/app",
        name: "feat",
        base: null,
        machine: THIS_MACHINE,
      }),
    );
  });

  test("reads back a Settings action, as the header's settings button sends it", () => {
    const action = { _tag: "Settings" } as const;
    expect(readAction(overTheWire(action))).toEqual(Option.some(action));
  });

  test("reads back a Focus action, as the toggle copy hands on the focus key", () => {
    const action = { _tag: "Focus" } as const;
    expect(readAction(overTheWire(action))).toEqual(Option.some(action));
  });

  test.each([
    { _tag: "NewOrOpen", folder: "/r/app" },
    { _tag: "NewOrOpen", folder: null },
  ] as const)("reads back a NewOrOpen for the folder $folder", (action) => {
    expect(readAction(overTheWire(action))).toEqual(Option.some(action));
  });

  test.each([
    { _tag: "Hide", machine: null, root: "/r/app" },
    { _tag: "Hide", machine: "linux", root: "/r/app" },
  ] as const)("reads back a Hide of the repo on machine $machine", (action) => {
    expect(readAction(overTheWire(action))).toEqual(Option.some(action));
  });

  test.each(SPACE_ACTS)(
    "reads back a SpaceWorktree asking to %s, as a space's menu posts it",
    (act) => {
      const action = { _tag: "SpaceWorktree", space: "sp1", act } as const;
      expect(readAction(overTheWire(action))).toEqual(Option.some(action));
    },
  );

  test.each([
    ["nothing", undefined],
    ["a string", "Refresh"],
    ["an unknown tag", { _tag: "Explode" }],
    ["a merge with no target", { _tag: "Merge", mode: "squash", dirty: false }],
    [
      "a merge with an unknown mode",
      { _tag: "Merge", target: { main: "/r", path: "/r.f", branch: "f" }, mode: "x", dirty: false },
    ],
    [
      "a remove that doesn't say if it is dirty",
      { _tag: "Remove", target: { main: "/r", path: "/r.f", branch: "f" } },
    ],
    ["a clean up with a bad batch", { _tag: "Cleanup", batches: [{ main: 1 }], dirty: 0 }],
    ["an open with a bad click", { _tag: "Open", click: { _tag: "Select" } }],
    ["a create whose base isn't text or null", { _tag: "Create", main: "/r", name: "f", base: 1 }],
    ["a hide with no repo", { _tag: "Hide" }],
    ["a new-or-open with no folder", { _tag: "NewOrOpen" }],
    ["the New dialog's old action, which New or open replaced", { _tag: "New", main: "/r" }],
    ["the new key's old action, which New or open replaced", { _tag: "NewHere" }],
    [
      "a space's worktree act it doesn't know",
      { _tag: "SpaceWorktree", space: "sp1", act: "Push" },
    ],
    ["a space's worktree act with no space", { _tag: "SpaceWorktree", act: "Merge" }],
  ])("is none for %s", (_label, value) => {
    expect(readAction(value)).toEqual(Option.none());
  });

  test.each(actionsOf(repoMenu({ machine: THIS_MACHINE, root: "/r/app" }, [MAIN, FEAT, DONE])))(
    "reads back the repo menu's $_tag action as it was sent",
    (action) => {
      expect(readAction(overTheWire(action))).toEqual(Option.some(action));
    },
  );
});

describe("readRequest", () => {
  test("reads an id and an action", () => {
    expect(readRequest(overTheWire({ id: 12.5, action: { _tag: "Refresh" } }))).toEqual(
      Option.some({ id: 12.5, action: { _tag: "Refresh" } }),
    );
  });

  test("is none without a numeric id or a readable action", () => {
    expect(readRequest({ id: "1", action: { _tag: "Refresh" } })).toEqual(Option.none());
    expect(readRequest({ id: 1, action: { _tag: "Nope" } })).toEqual(Option.none());
    expect(readRequest(null)).toEqual(Option.none());
  });
});

describe("overlayOf", () => {
  test("the overlay id Herdr adds, or none", () => {
    expect(overlayOf({ overlay: "o1", role: "menu" })).toEqual(Option.some("o1"));
    expect(overlayOf({ role: "toggle" })).toEqual(Option.none());
    expect(overlayOf(undefined)).toEqual(Option.none());
  });
});

describe("readMenuProps", () => {
  test("reads a menu as the panel opens it", () => {
    const items = rowMenu({ machine: THIS_MACHINE, root: "/r/app" }, FEAT, {
      _tag: "Select",
      space: "s1",
    });
    expect(readMenuProps(overTheWire({ role: "menu", title: "feat", items }))).toEqual({
      title: "feat",
      items,
    });
  });

  test("leaves out items it can't read, and has no title when none is given", () => {
    const good = { label: "Refresh", danger: false, action: { _tag: "Refresh" } };
    expect(readMenuProps({ items: [good, { label: "Bad", action: { _tag: "?" } }, 3] })).toEqual({
      title: "",
      items: [good],
    });
    expect(readMenuProps({ items: "no" })).toEqual({ title: "", items: [] });
  });
});

describe("readConfirmProps", () => {
  const remove = rowMenu({ machine: THIS_MACHINE, root: "/r/app" }, FEAT, {
    _tag: "Select",
    space: "s1",
  })[3]?.action;

  test("asks what confirmFor asks of the action in the props", () => {
    expect(readConfirmProps(overTheWire({ role: "confirm", action: remove }))).toEqual(
      Option.flatMap(Option.fromNullishOr(remove), (action) =>
        Option.map(confirmFor(action), (confirm) => ({ confirm, action })),
      ),
    );
    expect(
      Option.map(readConfirmProps(overTheWire({ action: remove })), (p) => p.confirm.title),
    ).toEqual(Option.some("Remove feat?"));
  });

  test("is none for an action that needs no asking, or none at all", () => {
    expect(readConfirmProps({ action: { _tag: "Refresh" } })).toEqual(Option.none());
    expect(readConfirmProps({})).toEqual(Option.none());
  });
});

describe("readTitlebarProps", () => {
  test("reads the job's title and terminal", () => {
    expect(readTitlebarProps({ title: "Merge feat", addr: "t1" })).toEqual({
      title: "Merge feat",
      addr: Option.some("t1"),
    });
  });

  test("falls back to the mod's name and no terminal", () => {
    expect(readTitlebarProps({})).toEqual({ title: "Worktrunk", addr: Option.none() });
  });
});

describe("readDialogProps", () => {
  test("the repo, the branch I'm on and the repos to pick from; a repo with no folder is left out", () => {
    const app = { machine: THIS_MACHINE, root: "/r/app" };
    expect(
      readDialogProps({ role: "new", repo: app, branch: "feat/a", repos: [app, { root: 3 }] }),
    ).toEqual({
      mode: "new",
      repo: Option.some(app),
      branch: Option.some("feat/a"),
      repos: [app],
    });
  });

  test("anything missing or of the wrong type reads as none", () => {
    expect(readDialogProps({ mode: "edit", repo: null, branch: 7, repos: "/r/app" })).toEqual({
      mode: "new",
      repo: Option.none(),
      branch: Option.none(),
      repos: [],
    });
  });
});

describe("readSettingsText", () => {
  test("the file's text the dialog opens on, or null when there was none", () => {
    expect([
      readSettingsText({ role: "settings", text: "{}" }),
      readSettingsText({ role: "settings", text: null }),
      readSettingsText(undefined),
    ]).toEqual(["{}", null, null]);
  });
});

describe("overlay props writers", () => {
  const items = repoMenu({ machine: THIS_MACHINE, root: "/r/app" }, [MAIN, DONE]);
  const remove = Option.getOrThrow(Option.fromNullishOr(items[1]?.action));

  test("each names its overlay's role, and its reader reads back what it wrote", () => {
    const menu = overTheWire(menuProps("app", items));
    expect([roleOf(menu), readMenuProps(menu)]).toEqual([
      Option.some("menu"),
      { title: "app", items },
    ]);
    const confirm = overTheWire(confirmProps(remove));
    expect([roleOf(confirm), Option.map(readConfirmProps(confirm), (p) => p.action)]).toEqual([
      Option.some("confirm"),
      Option.some(remove),
    ]);
    const titlebar = overTheWire(titlebarProps("Merge feat", "t1"));
    expect([roleOf(titlebar), readTitlebarProps(titlebar)]).toEqual([
      Option.some("titlebar"),
      { title: "Merge feat", addr: Option.some("t1") },
    ]);
    const opened = {
      mode: "new" as const,
      repo: Option.some({ machine: THIS_MACHINE, root: "/r/app" }),
      branch: Option.none(),
      repos: [{ machine: THIS_MACHINE, root: "/r/app" }],
    };
    const dialog = overTheWire(dialogProps(opened));
    expect([roleOf(dialog), readDialogProps(dialog)]).toEqual([Option.some("new"), opened]);
    const settings = overTheWire(settingsProps('{ "depth": 3 }'));
    expect([roleOf(settings), readSettingsText(settings)]).toEqual([
      Option.some("settings"),
      '{ "depth": 3 }',
    ]);
    const none = overTheWire(settingsProps(null));
    expect(readSettingsText(none)).toBeNull();
  });
});
