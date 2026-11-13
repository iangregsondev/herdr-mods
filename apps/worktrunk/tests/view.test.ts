import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { repoKey, THIS_MACHINE } from "../src/machines.ts";
import type { CiRead, RepoList } from "../src/reads.ts";
import type { Repo } from "../src/repos.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import type { SpaceLike } from "../src/spaces.ts";
import {
  buildView,
  DEFAULT_VIEW_STATE,
  reposToRead,
  type RepoView,
  type RowView,
  type Snapshot,
} from "../src/view.ts";
import type { Ci, Worktree, WorktreeState } from "../src/worktrees.ts";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const HOUR = 3_600_000;

const wt = (
  path: string,
  branch: string | null,
  state: WorktreeState,
  more: Partial<Worktree> = {},
): Worktree => ({
  branch: Option.fromNullishOr(branch),
  path,
  state,
  ahead: 0,
  behind: 0,
  added: 0,
  deleted: 0,
  upstream: Option.none(),
  dirty: false,
  ci: { _tag: "NotAsked" },
  committedAt: Option.some(NOW - HOUR),
  ...more,
});

const MAIN: WorktreeState = { _tag: "Main" };
const ACTIVE: WorktreeState = { _tag: "Active" };
const CONFLICT: WorktreeState = { _tag: "Conflict" };
const NEW: WorktreeState = { _tag: "New" };
const merged = (reason: string | null): WorktreeState => ({
  _tag: "Merged",
  reason: Option.fromNullishOr(reason),
});

const read = (worktrees: readonly Worktree[], error: string | null = null): RepoList => ({
  _tag: "Read",
  worktrees,
  error: Option.fromNullishOr(error),
});

const space = (id: string, folder: string, extra: Partial<SpaceLike> = {}): SpaceLike => ({
  id,
  folder,
  machine: null,
  active: false,
  tabs: [{ id: `${id}-tab` }],
  ...extra,
});

const API: Repo = { machine: THIS_MACHINE, root: "/w/api", count: 4, group: "Work" };
const WEB: Repo = { machine: THIS_MACHINE, root: "/p/web", count: 1, group: "Other" };
/** The same folder as API, on another machine: another repo. */
const API_LINUX: Repo = { ...API, machine: "linux" };

const API_WORKTREES = [
  wt("/w/api", "main", MAIN),
  wt("/w/api.old", "old", merged("patch_id_match"), { committedAt: Option.some(NOW - 30 * HOUR) }),
  wt("/w/api.new", "new", ACTIVE, { committedAt: Option.some(NOW - 2 * 60_000) }),
  wt("/w/api.fight", "fight", CONFLICT),
];

const snapshot = (more: Partial<Snapshot> = {}): Snapshot => ({
  repos: [API, WEB],
  discovered: true,
  loading: false,
  lists: new Map([
    [repoKey(API), read(API_WORKTREES)],
    [repoKey(WEB), read([wt("/p/web", "main", MAIN)])],
  ]),
  settings: { ...DEFAULT_SETTINGS, folders: [{ name: "Work", path: "/w", machine: THIS_MACHINE }] },
  settingsError: Option.none(),
  discoverError: Option.none(),
  missingFolders: [],
  machines: new Map(),
  settingsFile: "iangregsondev-worktrunk.json",
  spaces: [],
  panes: [],
  folded: {},
  ci: new Map(),
  // "All repos", so single-checkout repos show unless a test turns the toggle on.
  view: { ...DEFAULT_VIEW_STATE, only: false },
  search: "",
  current: { _tag: "NotInRepo" },
  now: NOW,
  ...more,
});

const tree = (s: Snapshot): readonly RepoView[] => {
  const body = buildView(s).body;
  if (body._tag !== "Tree") expect.fail(`expected a tree, got ${body._tag}`);
  return body.repos;
};

const repo = (s: Snapshot, name: string): RepoView => {
  const found = tree(s).find((r) => r.name === name);
  if (!found) expect.fail(`no repo ${name}`);
  return found;
};

const allRows = (r: RepoView): readonly RowView[] => [
  ...r.main,
  ...r.sections.flatMap((s) => s.rows),
];

const row = (s: Snapshot, path: string): RowView => {
  const found = tree(s)
    .flatMap(allRows)
    .find((r) => r.key === path);
  if (!found) expect.fail(`no row ${path}`);
  return found;
};

describe("buildView: the Repos tree", () => {
  test("one entry per repo, in the order given, named by folder", () => {
    expect(tree(snapshot()).map((r) => r.name)).toEqual(["api", "web"]);
  });

  test("a repo shows its group, except Other", () => {
    expect(tree(snapshot()).map((r) => r.group)).toEqual([Option.some("Work"), Option.none()]);
  });

  test("its worktree count is wt list's once read, or the scan's when the list is empty", () => {
    const s = snapshot({
      repos: [
        { ...API, count: 9 },
        { ...WEB, count: 3 },
      ],
      lists: new Map([
        [repoKey(API), read(API_WORKTREES)],
        [repoKey(WEB), read([])],
      ]),
    });
    expect(tree(s).map((r) => r.count)).toEqual([Option.some(4), Option.some(3)]);
  });

  test("before its first read a repo is Reading, with no count; once read it is Ok", () => {
    const s = snapshot({ lists: new Map([[repoKey(WEB), read([wt("/p/web", "main", MAIN)])]]) });
    expect(tree(s).map((r) => [r.status, r.count])).toEqual([
      [{ _tag: "Reading" }, Option.none()],
      [{ _tag: "Ok" }, Option.some(1)],
    ]);
  });

  test("a failed read shows its error", () => {
    const s = snapshot({ lists: new Map([[repoKey(API), read(API_WORKTREES, "wt: not a repo")]]) });
    expect(repo(s, "api").status).toEqual({ _tag: "Error", text: "wt: not a repo" });
  });

  test("main checkout first, then Merged, In progress and Conflicts", () => {
    const api = repo(snapshot(), "api");
    expect(api.main.map((r) => r.label)).toEqual(["main"]);
    expect(api.sections.map((s) => [s.kind, s.label, s.rows.map((r) => r.label)])).toEqual([
      ["merged", "Merged · ready to clean up", ["old"]],
      ["active", "In progress", ["new"]],
      ["conflict", "Conflicts with main", ["fight"]],
    ]);
  });

  test("a New worktree counts with Active: In progress, an active dot, the Active view", () => {
    const list = read([
      wt("/w/api", "main", MAIN),
      wt("/w/api.wip", "wip", ACTIVE, { committedAt: Option.some(NOW - 2 * HOUR) }),
      wt("/w/api.fresh", "fresh", NEW),
    ]);
    const s = snapshot({ lists: new Map([[repoKey(API), list]]) });
    expect(repo(s, "api").sections.map((x) => [x.kind, x.count])).toEqual([["active", 2]]);
    expect(row(s, "/w/api.fresh").tone).toBe("active");
    const active = buildView({ ...s, view: { ...s.view, show: "active" } }).body;
    if (active._tag !== "Flat") expect.fail(`expected a flat list, got ${active._tag}`);
    expect(active.rows.map((r) => r.label)).toEqual(["fresh", "wip"]);
  });

  test("empty sections are left out", () => {
    expect(repo(snapshot(), "web").sections).toEqual([]);
  });

  test("rows in a section are newest commit first, with no commit last", () => {
    const list = read([
      wt("/w/api", "main", MAIN),
      wt("/w/api.c", "unborn", ACTIVE, { committedAt: Option.none() }),
      wt("/w/api.a", "older", ACTIVE, { committedAt: Option.some(NOW - 5 * HOUR) }),
      wt("/w/api.b", "newer", ACTIVE, { committedAt: Option.some(NOW - HOUR) }),
    ]);
    const api = repo(snapshot({ lists: new Map([[repoKey(API), list]]) }), "api");
    expect(api.sections[0]?.rows.map((r) => r.label)).toEqual(["newer", "older", "unborn"]);
  });

  test("a folded repo shows its header only", () => {
    const api = repo(snapshot({ folded: { "/w/api": true } }), "api");
    expect(api).toMatchObject({ folded: true, foldable: true });
    expect(api.main).toEqual([]);
    expect(api.sections).toEqual([]);
    expect(repo(snapshot(), "api").folded).toBe(false);
  });

  test("a folded section keeps its header and count but hides its rows", () => {
    const api = repo(snapshot({ folded: { "/w/api|merged": true } }), "api");
    expect(api.sections[0]).toMatchObject({
      key: "/w/api|merged",
      folded: true,
      count: 1,
      rows: [],
    });
    expect(api.sections[1]).toMatchObject({ folded: false, count: 1 });
  });

  test("a failed read keeps the rows it had", () => {
    const s = snapshot({ lists: new Map([[repoKey(API), read(API_WORKTREES, "wt: not a repo")]]) });
    expect(allRows(repo(s, "api"))).toHaveLength(4);
  });
});

describe("buildView: rows", () => {
  test("the dot's tone shows the state", () => {
    const s = snapshot();
    expect(row(s, "/w/api").tone).toBe("main");
    expect(row(s, "/w/api.old").tone).toBe("merged");
    expect(row(s, "/w/api.new").tone).toBe("active");
    expect(row(s, "/w/api.fight").tone).toBe("conflict");
  });

  test("hollow and not open when no space sits on it; a click opens a new space there", () => {
    const r = row(snapshot(), "/w/api.new");
    expect(r).toMatchObject({ hollow: true, open: false, current: false });
    expect(r.click).toEqual({ _tag: "New", name: "new", folder: "/w/api.new", machine: null });
  });

  test("a new space on the main checkout is named after the repo", () => {
    expect(row(snapshot(), "/w/api").click).toEqual({
      _tag: "New",
      name: "api",
      folder: "/w/api",
      machine: null,
    });
  });

  test("a space on it: solid, open, and a click switches to that space", () => {
    const s = snapshot({
      spaces: [space("s1", "/w/api.new")],
      panes: [{ tab: "s1-tab", cwd: "/w/api.new/src" }],
    });
    expect(row(s, "/w/api.new")).toMatchObject({
      hollow: false,
      open: true,
      current: false,
      click: { _tag: "Select", space: "s1" },
    });
    // The space's live folder is inside api.new, not the main checkout.
    expect(row(s, "/w/api").open).toBe(false);
  });

  test("highlighted when its space is the shown one", () => {
    const s = snapshot({ spaces: [space("s1", "/w/api", { active: true })] });
    expect(row(s, "/w/api").current).toBe(true);
  });

  test("a space at the same folder on another machine doesn't count as open", () => {
    const s = snapshot({ spaces: [space("s1", "/w/api", { machine: "vps" })] });
    expect(row(s, "/w/api").open).toBe(false);
  });

  test("a space made elsewhere but now in a worktree counts by its live folder", () => {
    const s = snapshot({
      spaces: [space("s2", "/somewhere/else")],
      panes: [{ tab: "s2-tab", cwd: "/p/web" }],
    });
    expect(row(s, "/p/web")).toMatchObject({ open: true, click: { _tag: "Select", space: "s2" } });
  });

  test("a detached worktree is labelled (detached), and its new space named by folder", () => {
    const list = read([wt("/w/api", "main", MAIN), wt("/w/api.d", null, ACTIVE)]);
    const r = row(snapshot({ lists: new Map([[repoKey(API), list]]) }), "/w/api.d");
    expect(r.label).toBe("(detached)");
    expect(r.click).toEqual({ _tag: "New", name: "api.d", folder: "/w/api.d", machine: null });
  });

  test("a New worktree carries a new badge; no other row has one", () => {
    const list = read([...API_WORKTREES, wt("/w/api.fresh", "fresh", NEW)]);
    const s = snapshot({ lists: new Map([[repoKey(API), list]]) });
    expect(row(s, "/w/api.fresh").badge).toEqual(Option.some("new"));
    for (const path of ["/w/api", "/w/api.old", "/w/api.new", "/w/api.fight"]) {
      expect(row(s, path).badge).toEqual(Option.none());
    }
  });

  test("uncommitted changes show as dirty", () => {
    const list = read([wt("/w/api", "main", MAIN, { dirty: true }), wt("/w/api.x", "x", ACTIVE)]);
    const s = snapshot({ lists: new Map([[repoKey(API), list]]) });
    expect([row(s, "/w/api").dirty, row(s, "/w/api.x").dirty]).toEqual([true, false]);
  });
});

describe("buildView: sublines", () => {
  const sub = (w: Worktree) =>
    row(snapshot({ lists: new Map([[repoKey(API), read([w])]]) }), w.path).subline;
  const NO_COMMIT = { committedAt: Option.none() };

  test("a main checkout in step with its remote says so", () => {
    expect(sub(wt("/w/api", "main", MAIN, NO_COMMIT))).toBe("main checkout");
  });

  test("ends with the last commit's age in minutes, hours, days or months", () => {
    const at = (ms: number) =>
      sub(wt("/w/api", "main", MAIN, { committedAt: Option.some(NOW - ms) }));
    expect(at(10_000)).toBe("main checkout · 1m");
    expect(at(25 * 60_000)).toBe("main checkout · 25m");
    expect(at(5 * HOUR)).toBe("main checkout · 5h");
    expect(at(3 * 24 * HOUR)).toBe("main checkout · 3d");
    expect(at(90 * 24 * HOUR)).toBe("main checkout · 3mo");
  });

  test("a main checkout behind or ahead of its remote says by how much instead", () => {
    const up = (ahead: number, behind: number) =>
      sub(wt("/w/api", "main", MAIN, { ...NO_COMMIT, upstream: Option.some({ ahead, behind }) }));
    expect(up(2, 3)).toBe("↓3 behind remote · ↑2 to push");
    expect(up(0, 1)).toBe("↓1 behind remote");
    expect(up(4, 0)).toBe("↑4 to push");
    expect(up(0, 0)).toBe("main checkout");
  });

  test("merged: how it was merged", () => {
    const how = (reason: string | null) => sub(wt("/w/a", "b", merged(reason), NO_COMMIT));
    expect(how("trees_match")).toBe("same files as main");
    expect(how("patch_id_match")).toBe("squash-merged");
    expect(how("ancestor")).toBe("in main's history");
    expect(how("something_new")).toBe("merged");
    expect(how(null)).toBe("merged");
  });

  test("in progress or conflicting: ahead/behind main, lines changed, behind remote", () => {
    const w = wt("/w/a", "b", ACTIVE, {
      ...NO_COMMIT,
      ahead: 3,
      behind: 1,
      added: 40,
      deleted: 2,
      upstream: Option.some({ ahead: 0, behind: 2 }),
    });
    expect(sub(w)).toBe("↑3 ↓1 vs main · +40 −2 · ↓2 remote");
    expect(sub({ ...w, state: CONFLICT })).toBe("↑3 ↓1 vs main · +40 −2 · ↓2 remote");
  });

  test("no line changes and in step with its remote: neither is shown", () => {
    const w = wt("/w/a", "b", ACTIVE, {
      ...NO_COMMIT,
      ahead: 1,
      upstream: Option.some({ ahead: 1, behind: 0 }),
    });
    expect(sub(w)).toBe("↑1 ↓0 vs main");
  });

  test("uncommitted changes come after the state, before the age", () => {
    const w = wt("/w/a", "b", ACTIVE, { dirty: true });
    expect(sub(w)).toBe("↑0 ↓0 vs main · uncommitted changes · 1h");
  });
});

describe("buildView: header, banners and empty states", () => {
  test("the spinner shows while loading", () => {
    expect(buildView(snapshot({ loading: true })).loading).toBe(true);
    expect(buildView(snapshot()).loading).toBe(false);
  });

  test("a settings error shows as a banner saying defaults are in use", () => {
    expect(buildView(snapshot()).banners).toEqual([]);
    const s = snapshot({ settingsError: Option.some("iangregsondev-worktrunk.json: bad") });
    expect(buildView(s).banners).toEqual([
      "iangregsondev-worktrunk.json: bad — using defaults until it's fixed.",
    ]);
  });

  test("a failed search for repos shows as a banner, after any settings error", () => {
    const s = snapshot({
      settingsError: Option.some("iangregsondev-worktrunk.json: bad"),
      discoverError: Option.some("git: command not found"),
    });
    expect(buildView(s).banners).toEqual([
      "iangregsondev-worktrunk.json: bad — using defaults until it's fixed.",
      "Couldn't look for repos: git: command not found",
    ]);
  });

  test("each missing group folder shows as a banner, after a failed search", () => {
    const s = snapshot({
      discoverError: Option.some("git: command not found"),
      missingFolders: ["/h/gone", "/h/also"],
    });
    expect(buildView(s).banners).toEqual([
      "Couldn't look for repos: git: command not found",
      "Group folder /h/gone doesn't exist, so it lists no repos.",
      "Group folder /h/also doesn't exist, so it lists no repos.",
    ]);
  });

  test("a machine still connecting shows one connecting line, after the missing folders", () => {
    const s = snapshot({
      missingFolders: ["/h/gone"],
      machines: new Map([["linux", { _tag: "Connecting" }]]),
    });
    expect(buildView(s).banners).toEqual([
      "Group folder /h/gone doesn't exist, so it lists no repos.",
      "linux: connecting…",
    ]);
  });

  test("a machine that can't be read shows one line naming it and the error", () => {
    const s = snapshot({
      machines: new Map([
        ["linux", { _tag: "Down", reason: "ssh: connect to host linux: timed out" }],
      ]),
    });
    expect(buildView(s).banners).toEqual([
      "Can't reach linux: ssh: connect to host linux: timed out",
    ]);
  });

  test("a machine that can't be read lists none of its repos, not even from an older read", () => {
    const s = snapshot({
      repos: [API, API_LINUX],
      lists: new Map([
        [repoKey(API), read(API_WORKTREES)],
        [repoKey(API_LINUX), read(API_WORKTREES)],
      ]),
      machines: new Map([["linux", { _tag: "Down", reason: "timed out" }]]),
    });
    expect(tree(s).map((r) => [r.name, r.machine])).toEqual([["api", Option.none()]]);
  });

  test("before the first scan: looking for repos", () => {
    const s = snapshot({ repos: [], discovered: false, loading: true });
    expect(buildView(s).body).toEqual({ _tag: "Message", text: "Looking for repos…" });
  });

  test("no repos and no group folders: says where to add them, Settings first", () => {
    const s = snapshot({ repos: [], settings: DEFAULT_SETTINGS });
    expect(buildView(s).body).toEqual({
      _tag: "Message",
      text: "No repos yet. Add your repo folders in Settings, or in iangregsondev-worktrunk.json in Herdr's folder.",
    });
  });

  test("group folders but no repos in them", () => {
    expect(buildView(snapshot({ repos: [] })).body).toEqual({
      _tag: "Message",
      text: "No repos found in your group folders.",
    });
  });
});

const PERSONAL: Repo = { machine: THIS_MACHINE, root: "/p/blog", count: 2, group: "Personal" };
const STRAY: Repo = { machine: THIS_MACHINE, root: "/x/tool", count: 2, group: "Lab" };
const withView = (view: Partial<Snapshot["view"]>, more: Partial<Snapshot> = {}) =>
  snapshot({ view: { ...DEFAULT_VIEW_STATE, only: false, ...view }, ...more });
const names = (s: Snapshot) => tree(s).map((r) => r.name);

describe("buildView: group chips", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    folders: [
      { name: "Work", path: "/w", machine: THIS_MACHINE },
      { name: "Personal", path: "/p", machine: THIS_MACHINE },
    ],
  };
  const repos = [API, WEB, PERSONAL, STRAY];
  const lists = new Map([
    [repoKey(API), read(API_WORKTREES)],
    [repoKey(WEB), read([wt("/p/web", "main", MAIN)])],
    [repoKey(PERSONAL), read([wt("/p/blog", "main", MAIN), wt("/p/blog.x", "x", ACTIVE)])],
    [repoKey(STRAY), read([wt("/x/tool", "main", MAIN), wt("/x/tool.y", "y", ACTIVE)])],
  ]);
  const chipsOf = (s: Snapshot) => buildView(s).chips.map((c) => [c.label, c.selected]);

  test("All, then the groups in Settings order, unknown groups by name, then Other", () => {
    expect(chipsOf(snapshot({ repos, lists, settings }))).toEqual([
      ["All", true],
      ["Work", false],
      ["Personal", false],
      ["Lab", false],
      ["Other", false],
    ]);
  });

  test("a group with no repos gets no chip", () => {
    expect(chipsOf(snapshot({ repos: [API], lists, settings }))).toEqual([
      ["All", true],
      ["Work", false],
    ]);
  });

  test("before the first scan the chips come from Settings, so a saved chip stays selected", () => {
    const s = withView(
      { group: Option.some("Personal") },
      { repos: [], discovered: false, settings },
    );
    expect(chipsOf(s)).toEqual([
      ["All", false],
      ["Work", false],
      ["Personal", true],
    ]);
  });

  test("a chip lists only its group's repos", () => {
    const s = (group: string) =>
      withView({ group: Option.some(group) }, { repos, lists, settings });
    expect(names(s("Personal"))).toEqual(["blog"]);
    expect(names(s("Other"))).toEqual(["web"]);
    expect(names(snapshot({ repos, lists, settings }))).toEqual(["api", "web", "blog", "tool"]);
  });

  test("a chip whose group is gone falls back to All", () => {
    const s = withView({ group: Option.some("Renamed") }, { repos, lists, settings });
    expect(chipsOf(s)[0]).toEqual(["All", true]);
    expect(names(s)).toEqual(["api", "web", "blog", "tool"]);
  });

  test("each chip carries the group it selects", () => {
    const chips = buildView(snapshot({ repos, lists, settings })).chips;
    expect(chips.map((c) => c.group)).toEqual([
      Option.none(),
      Option.some("Work"),
      Option.some("Personal"),
      Option.some("Lab"),
      Option.some("Other"),
    ]);
  });
});

describe("buildView: views", () => {
  const blogList = read([
    wt("/p/blog", "main", MAIN),
    wt("/p/blog.done", "done", merged("ancestor"), { committedAt: Option.some(NOW - 3 * HOUR) }),
    wt("/p/blog.wip", "wip", ACTIVE, { committedAt: Option.some(NOW - 10 * 60_000) }),
  ]);
  const both = (more: Partial<Snapshot> = {}) =>
    snapshot({
      repos: [API, PERSONAL],
      lists: new Map([
        [repoKey(API), read(API_WORKTREES)],
        [repoKey(PERSONAL), blogList],
      ]),
      ...more,
    });
  const flat = (s: Snapshot) => {
    const body = buildView(s).body;
    if (body._tag !== "Flat") expect.fail(`expected a flat list, got ${body._tag}`);
    return body;
  };
  const show = (view: Snapshot["view"]["show"], more: Partial<Snapshot> = {}) =>
    both({ view: { ...DEFAULT_VIEW_STATE, only: false, show: view }, ...more });

  test("the view picker lists every view, Current first, the selected one marked", () => {
    expect(buildView(show("active")).views).toEqual([
      { show: "current", label: "Current", selected: false },
      { show: "repos", label: "Repos", selected: false },
      { show: "merged", label: "Clean up", selected: false },
      { show: "active", label: "Active", selected: true },
      { show: "conflict", label: "Conflicts", selected: false },
      { show: "open", label: "Open", selected: false },
    ]);
  });

  test("Repos is the tree", () => {
    expect(buildView(show("repos")).body._tag).toBe("Tree");
  });

  test("Clean up: merged worktrees across repos, newest first, with a count", () => {
    const body = flat(show("merged"));
    expect(body.rows.map((r) => r.label)).toEqual(["done", "old"]);
    expect(body.summary).toEqual(Option.some("2 merged in 2 repos"));
  });

  test("Clean up in one repo says repo, not repos", () => {
    expect(flat(show("merged", { repos: [API] })).summary).toEqual(
      Option.some("1 merged in 1 repo"),
    );
  });

  test("Active: in-progress worktrees across repos, newest first", () => {
    const body = flat(show("active"));
    expect(body.rows.map((r) => r.label)).toEqual(["new", "wip"]);
    expect(body.summary).toEqual(Option.none());
  });

  test("Conflicts: worktrees that would conflict with main", () => {
    expect(flat(show("conflict")).rows.map((r) => r.label)).toEqual(["fight"]);
  });

  test("Open: every worktree a space sits on, main checkouts too", () => {
    const s = show("open", {
      spaces: [space("s1", "/w/api"), space("s2", "/p/blog.wip/src")],
    });
    expect(flat(s).rows.map((r) => r.key)).toEqual(["/p/blog.wip", "/w/api"]);
  });

  test("a flat row names its repo first in the subline, and knows its repo", () => {
    const [first] = flat(show("active")).rows;
    expect(first?.subline).toBe("api · ↑0 ↓0 vs main · 2m");
    expect(first?.repo).toBe("/w/api");
  });

  test("flat views follow the group chip", () => {
    const s = show("merged", {
      view: { ...DEFAULT_VIEW_STATE, show: "merged", group: Option.some("Work") },
    });
    expect(flat(s).rows.map((r) => r.label)).toEqual(["old"]);
  });

  test("an empty flat view says so", () => {
    const webOnly = {
      repos: [WEB],
      lists: new Map([[repoKey(WEB), read([wt("/p/web", "main", MAIN)])]]),
    };
    expect(buildView(show("conflict", { repos: [PERSONAL] })).body).toEqual({
      _tag: "Message",
      text: "No worktrees conflict with main.",
    });
    expect(buildView(show("merged", webOnly)).body).toEqual({
      _tag: "Message",
      text: "Nothing to clean up.",
    });
    expect(buildView(show("active", webOnly)).body).toEqual({
      _tag: "Message",
      text: "No worktrees in progress.",
    });
    expect(buildView(show("open")).body).toEqual({
      _tag: "Message",
      text: "No worktree has a space open.",
    });
  });

  test("an empty flat view says Reading while a repo is still unread", () => {
    expect(buildView(show("active", { lists: new Map() })).body).toEqual({
      _tag: "Message",
      text: "Reading…",
    });
  });
});

describe("buildView: the All repos / With worktrees toggle", () => {
  test("offered in the Repos view only", () => {
    expect(buildView(withView({ only: true })).toggle).toEqual(Option.some(true));
    expect(buildView(withView({ only: false })).toggle).toEqual(Option.some(false));
    expect(buildView(withView({ show: "active" })).toggle).toEqual(Option.none());
  });

  test("With worktrees hides repos with only a main checkout", () => {
    expect(names(withView({ only: true }))).toEqual(["api"]);
    expect(names(withView({ only: false }))).toEqual(["api", "web"]);
  });

  test("the count read from wt list wins over the scan's", () => {
    const grown = read([wt("/p/web", "main", MAIN), wt("/p/web.x", "x", ACTIVE)]);
    const lists = new Map([
      [repoKey(API), read(API_WORKTREES)],
      [repoKey(WEB), grown],
    ]);
    expect(names(withView({ only: true }, { lists }))).toEqual(["api", "web"]);
  });

  test("an unread repo is judged by the scan's count", () => {
    expect(names(withView({ only: true }, { lists: new Map() }))).toEqual(["api"]);
  });

  test("the toggle doesn't touch flat views", () => {
    const s = withView({ only: true, show: "open" }, { spaces: [space("s1", "/p/web")] });
    const body = buildView(s).body;
    expect(body._tag === "Flat" && body.rows.map((r) => r.key)).toEqual(["/p/web"]);
  });

  test("when it hides every repo, it says how to see them", () => {
    expect(buildView(withView({ only: true }, { repos: [WEB] })).body).toEqual({
      _tag: "Message",
      text: "No repos with worktrees here. Choose All repos to see the rest.",
    });
  });
});

describe("buildView: search", () => {
  const labels = (s: Snapshot) => tree(s).flatMap((r) => allRows(r).map((x) => x.label));

  test("matches a branch name, ignoring case and spaces around it", () => {
    expect(labels(snapshot({ search: "  NEW " }))).toEqual(["new"]);
  });

  test("a repo with no matching worktree drops out while searching", () => {
    expect(names(snapshot({ search: "fight" }))).toEqual(["api"]);
  });

  test("matching a repo's name keeps all its worktrees", () => {
    expect(labels(snapshot({ search: "web" }))).toEqual(["main"]);
    expect(labels(snapshot({ search: "ap" }))).toEqual(["main", "old", "new", "fight"]);
  });

  test("searching shows matches inside folded repos and sections", () => {
    const s = snapshot({ search: "old", folded: { "/w/api": true, "/w/api|merged": true } });
    const api = repo(s, "api");
    expect(api.folded).toBe(false);
    expect(api.sections[0]).toMatchObject({ folded: false, rows: [{ label: "old" }] });
  });

  test("folding comes back when the search is cleared", () => {
    const s = snapshot({ search: " ", folded: { "/w/api": true } });
    expect(repo(s, "api").folded).toBe(true);
  });

  test("an unread repo stays only when its name matches", () => {
    const s = (search: string) => snapshot({ search, lists: new Map() });
    expect(names(s("api"))).toEqual(["api"]);
    expect(buildView(s("old")).body).toEqual({ _tag: "Message", text: 'Nothing matches "old".' });
  });

  test("narrows the flat views too", () => {
    const found = buildView(withView({ show: "active" }, { search: "NE" })).body;
    expect(found._tag === "Flat" && found.rows.map((r) => r.label)).toEqual(["new"]);
    expect(buildView(withView({ show: "merged" }, { search: "nothing-like-it" })).body).toEqual({
      _tag: "Message",
      text: 'Nothing matches "nothing-like-it".',
    });
  });

  test("nothing matching in the tree says so", () => {
    expect(buildView(snapshot({ search: "zzz" })).body).toEqual({
      _tag: "Message",
      text: 'Nothing matches "zzz".',
    });
  });

  test("a space on a worktree the search hides stays on it, never on the main checkout", () => {
    const nested = read([wt("/w/api", "main", MAIN), wt("/w/api/.wt/feat", "feat", ACTIVE)]);
    const s = snapshot({
      repos: [API],
      lists: new Map([[repoKey(API), nested]]),
      spaces: [space("s1", "/w/api/.wt/feat/src")],
      search: "main",
    });
    expect(row(s, "/w/api")).toMatchObject({ open: false, hollow: true });
  });
});

describe("buildView: CI", () => {
  const checks = (status: "passed" | "running" | "failed", stale = false): Ci => ({
    _tag: "Checks",
    status,
    stale,
  });
  const ciRead = (byPath: readonly (readonly [string, Ci])[], error: string | null = null) => {
    const read: CiRead = { byPath: new Map(byPath), error: Option.fromNullishOr(error) };
    return read;
  };
  const withCi = (byPath: readonly (readonly [string, Ci])[], error: string | null = null) =>
    snapshot({ ci: new Map([[repoKey(API), ciRead(byPath, error)]]) });

  test("each row shows its CI from the last CI read", () => {
    const s = withCi([
      ["/w/api", checks("passed")],
      ["/w/api.new", checks("running")],
      ["/w/api.fight", checks("failed", true)],
      ["/w/api.old", { _tag: "Conflicts" }],
    ]);
    expect(row(s, "/w/api").ci).toEqual(Option.some({ status: "passed", stale: false }));
    expect(row(s, "/w/api.new").ci).toEqual(Option.some({ status: "running", stale: false }));
    expect(row(s, "/w/api.fight").ci).toEqual(Option.some({ status: "failed", stale: true }));
    expect(row(s, "/w/api.old").ci).toEqual(Option.some({ status: "conflicts", stale: false }));
  });

  test("a forge that gave no answer shows as unknown, never as nothing", () => {
    const s = withCi([["/w/api.new", { _tag: "Unknown" }]]);
    expect(row(s, "/w/api.new").ci).toEqual(Option.some({ status: "unknown", stale: false }));
  });

  test("no PR and no checks: no badge", () => {
    expect(row(withCi([["/w/api.new", { _tag: "None" }]]), "/w/api.new").ci).toEqual(Option.none());
  });

  test("no CI read yet: no badge", () => {
    expect(row(snapshot(), "/w/api.new").ci).toEqual(Option.none());
  });

  test("CI that came with the list itself counts when there's no CI read", () => {
    const list = read([wt("/w/api", "main", MAIN, { ci: checks("passed") })]);
    const s = snapshot({ lists: new Map([[repoKey(API), list]]) });
    expect(row(s, "/w/api").ci).toEqual(Option.some({ status: "passed", stale: false }));
  });

  test("a failed CI read keeps the last answers and says it is out of date", () => {
    const s = withCi([["/w/api", checks("passed")]], "timed out after 240s");
    expect(row(s, "/w/api").ci).toEqual(Option.some({ status: "passed", stale: false }));
    expect(repo(s, "api").ciNote).toEqual(
      Option.some("CI status not updated: timed out after 240s"),
    );
    expect(repo(withCi([]), "api").ciNote).toEqual(Option.none());
  });

  test("flat rows carry CI too", () => {
    const s = snapshot({
      view: { ...DEFAULT_VIEW_STATE, show: "active" },
      ci: new Map([[repoKey(API), ciRead([["/w/api.new", checks("failed")]])]]),
    });
    const body = buildView(s).body;
    expect(body._tag === "Flat" && body.rows[0]?.ci).toEqual(
      Option.some({ status: "failed", stale: false }),
    );
  });
});

describe("buildView: the Current view", () => {
  const current = (more: Partial<Snapshot> = {}): Snapshot =>
    snapshot({ view: { ...DEFAULT_VIEW_STATE, only: false, show: "current" }, ...more });
  const inRepo = (repo: Repo): Snapshot["current"] => ({ _tag: "InRepo", repo });

  test("the Current repo, laid out like one expanded repo of the Repos tree", () => {
    const s = current({ current: inRepo(API) });
    expect(tree(s).map((r) => r.name)).toEqual(["api"]);
    const api = repo(s, "api");
    expect(api.main.map((r) => r.label)).toEqual(["main"]);
    expect(api.sections.map((x) => [x.kind, x.rows.map((r) => r.label)])).toEqual([
      ["merged", ["old"]],
      ["active", ["new"]],
      ["conflict", ["fight"]],
    ]);
  });

  test("focused in a linked worktree: still the whole repo, its row open and shown", () => {
    const s = current({
      current: inRepo(API),
      spaces: [space("s1", "/w/api.new", { active: true })],
    });
    expect(tree(s).map((r) => r.name)).toEqual(["api"]);
    expect(row(s, "/w/api.new")).toMatchObject({ open: true, current: true });
    expect(row(s, "/w/api")).toMatchObject({ open: false });
  });

  test("never folded, though its groups still fold", () => {
    const s = current({
      current: inRepo(API),
      folded: { [API.root]: true, [`${API.root}|merged`]: true },
    });
    const api = repo(s, "api");
    expect(api).toMatchObject({ folded: false, foldable: false });
    expect(api.main.map((r) => r.label)).toEqual(["main"]);
    expect(api.sections.find((x) => x.kind === "merged")).toMatchObject({ folded: true, rows: [] });
  });

  test("ignores the group chips and the With worktrees toggle", () => {
    const s = current({
      current: inRepo(WEB),
      view: { ...DEFAULT_VIEW_STATE, group: Option.some("Work"), show: "current", only: true },
    });
    expect(tree(s).map((r) => r.name)).toEqual(["web"]);
    expect(buildView(s).toggle).toEqual(Option.none());
  });

  test("the search box narrows it", () => {
    const s = current({ current: inRepo(API), search: "NEW" });
    expect(allRows(repo(s, "api")).map((r) => r.label)).toEqual(["new"]);
  });

  test("a search that matches nothing in it says so", () => {
    expect(buildView(current({ current: inRepo(API), search: "zzz" })).body).toEqual({
      _tag: "Message",
      text: 'Nothing matches "zzz".',
    });
  });

  test("a Current repo not read yet shows as Reading, searched or not", () => {
    const s = current({ current: inRepo(API), lists: new Map() });
    expect(repo(s, "api").status).toEqual({ _tag: "Reading" });
    expect(repo({ ...s, search: "new" }, "api").status).toEqual({ _tag: "Reading" });
  });

  test("not in a repo: says so, with every open worktree below, whatever the chip", () => {
    const s = current({
      current: { _tag: "NotInRepo" },
      view: { ...DEFAULT_VIEW_STATE, group: Option.some("Work"), show: "current" },
      spaces: [space("s1", "/w/api.new"), space("s2", "/p/web")],
    });
    const body = buildView(s).body;
    if (body._tag !== "NotInRepo") expect.fail(`expected NotInRepo, got ${body._tag}`);
    expect(body.text).toBe("Not in a repo");
    if (body.open._tag !== "Flat") expect.fail(`expected a flat list, got ${body.open._tag}`);
    expect(body.open.rows.map((r) => r.key)).toEqual(["/w/api.new", "/p/web"]);
  });

  test("not in a repo and no repos at all: says both", () => {
    expect(buildView(current({ repos: [] })).body).toEqual({
      _tag: "NotInRepo",
      text: "Not in a repo",
      open: { _tag: "Message", text: "No worktree has a space open." },
    });
  });

  test("while the Current repo is being looked up, says so", () => {
    expect(buildView(current({ current: { _tag: "Looking" } })).body).toEqual({
      _tag: "Message",
      text: "Finding the current repo…",
    });
  });

  test("a lookup that failed says why", () => {
    expect(buildView(current({ current: { _tag: "Failed", reason: "git: boom" } })).body).toEqual({
      _tag: "Message",
      text: "Couldn't find the current repo: git: boom",
    });
  });
});

describe("reposToRead", () => {
  const scope = (view: Partial<Snapshot["view"]>, current: Snapshot["current"]) =>
    snapshot({ view: { ...DEFAULT_VIEW_STATE, ...view }, current });

  test("the Current view reads the Current repo alone", () => {
    const s = scope({ show: "current" }, { _tag: "InRepo", repo: WEB });
    expect(reposToRead(s)).toEqual([WEB]);
  });

  test("the Current view outside every repo reads every repo, whatever the chip", () => {
    const s = scope({ show: "current", group: Option.some("Work") }, { _tag: "NotInRepo" });
    expect(reposToRead(s)).toEqual([API, WEB]);
  });

  test("every other view reads the selected chip's repos", () => {
    const s = scope({ show: "repos", group: Option.some("Work") }, { _tag: "InRepo", repo: WEB });
    expect(reposToRead(s)).toEqual([API]);
  });
  test("no repo on a machine that can't be read is read, in any view", () => {
    const down = new Map([["linux", { _tag: "Connecting" } as const]]);
    const s = snapshot({ repos: [API, API_LINUX, WEB], machines: down });
    expect(reposToRead(s)).toEqual([API, WEB]);
    const current = { ...s, view: { ...s.view, show: "current" as const } };
    expect(reposToRead(current)).toEqual([API, WEB]);
  });
});

describe("buildView: the same folder on two machines", () => {
  const both = (more: Partial<Snapshot> = {}) =>
    tree(snapshot({ repos: [API, API_LINUX], ...more }));

  test("each repo reads its own list, by machine and folder", () => {
    const [here, linux] = both({ lists: new Map([[repoKey(API), read(API_WORKTREES)]]) });
    expect([here?.status, linux?.status]).toEqual([{ _tag: "Ok" }, { _tag: "Reading" }]);
  });

  test("folding one folds it alone, its sections too", () => {
    const lists = new Map([
      [repoKey(API), read(API_WORKTREES)],
      [repoKey(API_LINUX), read(API_WORKTREES)],
    ]);
    const linuxKey = repoKey(API_LINUX);
    const [here, linux] = both({ lists, folded: { [linuxKey]: true } });
    expect([here?.folded, linux?.folded]).toEqual([false, true]);
    const sections = both({ lists, folded: { [`${linuxKey}|merged`]: true } }).map(
      (r) => r.sections.find((x) => x.kind === "merged")?.folded,
    );
    expect(sections).toEqual([false, true]);
  });

  test("Clean up counts them as two repos", () => {
    const lists = new Map([
      [repoKey(API), read(API_WORKTREES)],
      [repoKey(API_LINUX), read(API_WORKTREES)],
    ]);
    const s = snapshot({
      repos: [API, API_LINUX],
      lists,
      view: { ...DEFAULT_VIEW_STATE, show: "merged" },
    });
    const body = buildView(s).body;
    expect(body._tag === "Flat" && body.summary).toEqual(Option.some("2 merged in 2 repos"));
  });

  test("each row's key names its machine, so the same folder's rows never share one", () => {
    const lists = new Map([
      [repoKey(API), read([wt("/w/api", "main", MAIN)])],
      [repoKey(API_LINUX), read([wt("/w/api", "main", MAIN)])],
    ]);
    expect(both({ lists }).map((r) => r.main[0]?.key)).toEqual([
      "/w/api",
      repoKey({ machine: "linux", root: "/w/api" }),
    ]);
  });

  test("each repo shows its own CI", () => {
    const lists = new Map([
      [repoKey(API), read([wt("/w/api", "main", MAIN)])],
      [repoKey(API_LINUX), read([wt("/w/api", "main", MAIN)])],
    ]);
    const ci: CiRead = {
      byPath: new Map([["/w/api", { _tag: "Checks", status: "failed", stale: false }]]),
      error: Option.some("timed out"),
    };
    const repos = both({ lists, ci: new Map([[repoKey(API_LINUX), ci]]) });
    expect(repos.map((r) => r.main[0]?.ci)).toEqual([
      Option.none(),
      Option.some({ status: "failed", stale: false }),
    ]);
    expect(repos.map((r) => Option.isSome(r.ciNote))).toEqual([false, true]);
  });
});

describe("buildView: spaces on other machines", () => {
  const lists = new Map([
    [repoKey(API), read(API_WORKTREES)],
    [repoKey(API_LINUX), read(API_WORKTREES)],
  ]);
  const onLinux = space("s1", "/w/api.new", { machine: "linux" });

  test("a space opens the worktree on its own machine, not the same folder here", () => {
    const [here, linux] = tree(snapshot({ repos: [API, API_LINUX], lists, spaces: [onLinux] }));
    const openOf = (r: RepoView | undefined) =>
      r
        ? allRows(r)
            .filter((x) => x.open)
            .map((x) => x.label)
        : [];
    expect([openOf(here), openOf(linux)]).toEqual([[], ["new"]]);
  });

  test("a worktree with no space opens a new one on its repo's machine", () => {
    const [, linux] = tree(snapshot({ repos: [API, API_LINUX], lists }));
    const fight = linux ? allRows(linux).find((x) => x.label === "fight") : undefined;
    expect(fight?.click).toEqual({
      _tag: "New",
      name: "fight",
      folder: "/w/api.fight",
      machine: "linux",
    });
  });

  test("the Open view lists a worktree whose space is on another machine", () => {
    const s = snapshot({
      repos: [API, API_LINUX],
      lists,
      spaces: [onLinux],
      view: { ...DEFAULT_VIEW_STATE, show: "open" },
    });
    const body = buildView(s).body;
    expect(body._tag === "Flat" && body.rows.map((r) => [r.label, r.open])).toEqual([
      ["new", true],
    ]);
  });
});

describe("buildView: machine labels", () => {
  test("with repos on more than one machine, a flat row names its machine before its repo", () => {
    const lists = new Map([
      [repoKey(API), read(API_WORKTREES)],
      [repoKey(API_LINUX), read(API_WORKTREES)],
    ]);
    const s = snapshot({
      repos: [API, API_LINUX],
      lists,
      spaces: [space("s1", "/w/api"), space("s2", "/w/api.new", { machine: "linux" })],
      view: { ...DEFAULT_VIEW_STATE, show: "open" },
    });
    const body = buildView(s).body;
    expect(body._tag === "Flat" && body.rows.map((r) => r.subline.split(" · ")[0])).toEqual([
      "linux: api",
      "this machine: api",
    ]);
  });

  test("with repos on more than one machine, each repo names its machine", () => {
    const repos = tree(snapshot({ repos: [API, API_LINUX] }));
    expect(repos.map((r) => r.machine)).toEqual([
      Option.some("this machine"),
      Option.some("linux"),
    ]);
  });

  test("with every repo on one machine, no repo names it", () => {
    expect(tree(snapshot()).map((r) => r.machine)).toEqual([Option.none(), Option.none()]);
  });
});

describe("buildView: the machine filter", () => {
  const choices = (s: Snapshot) =>
    buildView(s).machineFilter.map((c) => [c.label, c.machine, c.selected]);

  test("offers All, then this machine, then each other machine by name, starting at All", () => {
    const API_MAC: Repo = { ...API, machine: "mac" };
    expect(choices(snapshot({ repos: [API_LINUX, WEB, API_MAC] }))).toEqual([
      ["All", Option.none(), true],
      ["this machine", Option.some(null), false],
      ["linux", Option.some("linux"), false],
      ["mac", Option.some("mac"), false],
    ]);
  });

  test("with every repo and folder on one machine there is nothing to filter, so no choices", () => {
    expect(buildView(snapshot()).machineFilter).toEqual([]);
  });

  test("offers a machine a group folder names before any repo is found on it", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      folders: [{ name: "Box", path: "~/code", machine: "linux" }],
    };
    expect(choices(snapshot({ repos: [API], settings })).map(([label]) => label)).toEqual([
      "All",
      "this machine",
      "linux",
    ]);
  });

  const LINUX_WEB: Repo = { ...WEB, machine: "linux" };
  const onMachines = (machine: Option.Option<string | null>) =>
    withView({ machine }, { repos: [API, API_LINUX, WEB, LINUX_WEB] });

  test("picking a machine lists only that machine's repos", () => {
    expect(tree(onMachines(Option.some("linux"))).map((r) => r.key)).toEqual([
      repoKey(API_LINUX),
      repoKey(LINUX_WEB),
    ]);
    expect(tree(onMachines(Option.some(null))).map((r) => r.key)).toEqual([
      repoKey(API),
      repoKey(WEB),
    ]);
  });

  test("only the filtered machine's repos are read, in the Current view outside a repo too", () => {
    const linux = onMachines(Option.some("linux"));
    expect(reposToRead(linux)).toEqual([API_LINUX, LINUX_WEB]);
    const current = { ...linux, view: { ...linux.view, show: "current" as const } };
    expect(reposToRead(current)).toEqual([API_LINUX, LINUX_WEB]);
  });

  test("a filtered machine no repo or folder is on any more falls back to All", () => {
    const s = withView({ machine: Option.some("mac") }, { repos: [API, API_LINUX] });
    expect(tree(s).map((r) => r.key)).toEqual([repoKey(API), repoKey(API_LINUX)]);
    expect(choices(s)[0]).toEqual(["All", Option.none(), true]);
    expect(reposToRead(s)).toEqual([API, API_LINUX]);
  });

  test("before the first scan a filtered machine stays, so a saved filter never flashes All", () => {
    const s = withView({ machine: Option.some("mac") }, { repos: [API_LINUX], discovered: false });
    expect(choices(s).find(([, , selected]) => selected)).toBeUndefined();
    expect(reposToRead(s)).toEqual([]);
  });

  test("machine labels follow the filter: none while one machine is in view", () => {
    const lists = new Map([
      [repoKey(API), read(API_WORKTREES)],
      [repoKey(API_LINUX), read(API_WORKTREES)],
    ]);
    const linux = withView({ machine: Option.some("linux") }, { repos: [API, API_LINUX], lists });
    expect(tree(linux).map((r) => r.machine)).toEqual([Option.none()]);
    const open = { ...linux, view: { ...linux.view, show: "merged" as const } };
    const body = buildView(open).body;
    expect(body._tag === "Flat" && body.rows.map((r) => r.subline.split(" · ")[0])).toEqual([
      "api",
    ]);
    const all = { ...linux, view: { ...linux.view, machine: Option.none() } };
    expect(tree(all).map((r) => r.machine)).toEqual([
      Option.some("this machine"),
      Option.some("linux"),
    ]);
  });
});
