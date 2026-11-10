import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import type { RepoList } from "../src/reads.ts";
import type { Repo } from "../src/repos.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import type { SpaceLike } from "../src/spaces.ts";
import { buildView, type RepoView, type RowView, type Snapshot } from "../src/view.ts";
import type { Worktree, WorktreeState } from "../src/worktrees.ts";

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
  committedAt: Option.some(NOW - HOUR),
  ...more,
});

const MAIN: WorktreeState = { _tag: "Main" };
const ACTIVE: WorktreeState = { _tag: "Active" };
const CONFLICT: WorktreeState = { _tag: "Conflict" };
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

const API: Repo = { root: "/w/api", count: 4, group: "Work" };
const WEB: Repo = { root: "/p/web", count: 1, group: "Other" };

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
    [API.root, read(API_WORKTREES)],
    [WEB.root, read([wt("/p/web", "main", MAIN)])],
  ]),
  settings: { ...DEFAULT_SETTINGS, folders: [{ name: "Work", path: "/w" }] },
  settingsError: Option.none(),
  discoverError: Option.none(),
  settingsFile: "iangregsondev-worktrunk.json",
  spaces: [],
  panes: [],
  folded: {},
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
        [API.root, read(API_WORKTREES)],
        [WEB.root, read([])],
      ]),
    });
    expect(tree(s).map((r) => r.count)).toEqual([Option.some(4), Option.some(3)]);
  });

  test("before its first read a repo is Reading, with no count; once read it is Ok", () => {
    const s = snapshot({ lists: new Map([[WEB.root, read([wt("/p/web", "main", MAIN)])]]) });
    expect(tree(s).map((r) => [r.status, r.count])).toEqual([
      [{ _tag: "Reading" }, Option.none()],
      [{ _tag: "Ok" }, Option.some(1)],
    ]);
  });

  test("a failed read shows its error", () => {
    const s = snapshot({ lists: new Map([[API.root, read(API_WORKTREES, "wt: not a repo")]]) });
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
    const api = repo(snapshot({ lists: new Map([[API.root, list]]) }), "api");
    expect(api.sections[0]?.rows.map((r) => r.label)).toEqual(["newer", "older", "unborn"]);
  });

  test("a folded repo shows its header only", () => {
    const api = repo(snapshot({ folded: { "/w/api": true } }), "api");
    expect(api.folded).toBe(true);
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
    const s = snapshot({ lists: new Map([[API.root, read(API_WORKTREES, "wt: not a repo")]]) });
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
    expect(r.click).toEqual({ _tag: "New", name: "new", folder: "/w/api.new" });
  });

  test("a new space on the main checkout is named after the repo", () => {
    expect(row(snapshot(), "/w/api").click).toEqual({ _tag: "New", name: "api", folder: "/w/api" });
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

  test("a space on another machine doesn't count as open", () => {
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
    const r = row(snapshot({ lists: new Map([[API.root, list]]) }), "/w/api.d");
    expect(r.label).toBe("(detached)");
    expect(r.click).toEqual({ _tag: "New", name: "api.d", folder: "/w/api.d" });
  });

  test("uncommitted changes show as dirty", () => {
    const list = read([wt("/w/api", "main", MAIN, { dirty: true }), wt("/w/api.x", "x", ACTIVE)]);
    const s = snapshot({ lists: new Map([[API.root, list]]) });
    expect([row(s, "/w/api").dirty, row(s, "/w/api.x").dirty]).toEqual([true, false]);
  });
});

describe("buildView: sublines", () => {
  const sub = (w: Worktree) =>
    row(snapshot({ lists: new Map([[API.root, read([w])]]) }), w.path).subline;
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

  test("before the first scan: looking for repos", () => {
    const s = snapshot({ repos: [], discovered: false, loading: true });
    expect(buildView(s).body).toEqual({ _tag: "Message", text: "Looking for repos…" });
  });

  test("no repos and no group folders: says where to add them", () => {
    const s = snapshot({ repos: [], settings: DEFAULT_SETTINGS });
    expect(buildView(s).body).toEqual({
      _tag: "Message",
      text: "No repos yet. Add your repo folders to iangregsondev-worktrunk.json in Herdr's folder.",
    });
  });

  test("group folders but no repos in them", () => {
    expect(buildView(snapshot({ repos: [] })).body).toEqual({
      _tag: "Message",
      text: "No repos found in your group folders.",
    });
  });
});
