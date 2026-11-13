import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  busyNotice,
  cleanupAction,
  cleanupFor,
  confirmFor,
  dialogHeight,
  findWorktree,
  jobsFor,
  menuHeight,
  repoMenu,
  rowMenu,
  spaceWorktreeAction,
} from "../src/menus.ts";
import { mergeScript, removeScript, cleanupScript } from "../src/commands.ts";
import { repoKey, THIS_MACHINE } from "../src/machines.ts";
import type { RepoList } from "../src/reads.ts";
import type { Click } from "../src/view.ts";
import type { Worktree, WorktreeState } from "../src/worktrees.ts";

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
  committedAt: Option.none(),
  ...more,
});

const MAIN: WorktreeState = { _tag: "Main" };
const ACTIVE: WorktreeState = { _tag: "Active" };
const MERGED: WorktreeState = { _tag: "Merged", reason: Option.none() };

const CLICK: Click = {
  _tag: "New",
  name: "feat/x",
  folder: "/r/app.feat-x",
  machine: THIS_MACHINE,
};
const FEAT = wt("/r/app.feat-x", "feat/x", ACTIVE);

const labels = (items: readonly { readonly label: string }[]) => items.map((i) => i.label);

/** The app repo, on this machine. */
const APP = { machine: THIS_MACHINE, root: "/r/app" };

/** The app repo, on this machine, where a test's own `APP` names a worktree. */
const APP_REPO = APP;

describe("rowMenu", () => {
  test("a linked worktree: open, both merges, remove, copy path, reveal", () => {
    expect(labels(rowMenu(APP, FEAT, CLICK))).toEqual([
      "Open",
      "Merge into main (squash)",
      "Merge, keeping every commit",
      "Remove…",
      "Copy path",
      "Reveal in Finder",
    ]);
  });

  test("the main checkout can't be merged or removed", () => {
    expect(labels(rowMenu(APP, wt("/r/app", "main", MAIN), CLICK))).toEqual([
      "Open",
      "Copy path",
      "Reveal in Finder",
    ]);
  });

  test("only Remove is marked as destructive", () => {
    const danger = rowMenu(APP, FEAT, CLICK).filter((i) => i.danger);
    expect(labels(danger)).toEqual(["Remove…"]);
  });

  test("the merges target the worktree, its branch and its repo, saying if it is dirty", () => {
    const dirty = wt("/r/app.feat-x", "feat/x", ACTIVE, { dirty: true });
    const target = {
      machine: THIS_MACHINE,
      main: "/r/app",
      path: "/r/app.feat-x",
      branch: "feat/x",
    };
    expect(
      rowMenu(APP, dirty, CLICK)
        .slice(1, 4)
        .map((i) => i.action),
    ).toEqual([
      { _tag: "Merge", target, mode: "squash", dirty: true },
      { _tag: "Merge", target, mode: "keep", dirty: true },
      { _tag: "Remove", target, dirty: true },
    ]);
  });

  test("open does what a click on the row does; copy and reveal act on its folder", () => {
    const actions = rowMenu(APP, FEAT, CLICK).map((i) => i.action);
    expect([actions[0], actions[4], actions[5]]).toEqual([
      { _tag: "Open", click: CLICK },
      { _tag: "CopyPath", path: "/r/app.feat-x" },
      { _tag: "Reveal", path: "/r/app.feat-x" },
    ]);
  });

  test("a detached worktree can be removed by its folder, but not merged", () => {
    const detached = wt("/r/app.tmp", null, ACTIVE);
    const items = rowMenu(APP, detached, CLICK);
    expect(labels(items)).toEqual(["Open", "Remove…", "Copy path", "Reveal in Finder"]);
    expect(items[1]?.action).toEqual({
      _tag: "Remove",
      target: { machine: THIS_MACHINE, main: "/r/app", path: "/r/app.tmp", branch: "/r/app.tmp" },
      dirty: false,
    });
  });
});

describe("rowMenu on another machine", () => {
  test("offers no Reveal in Finder: the folder isn't on this machine", () => {
    const items = rowMenu({ machine: "linux", root: "/r/app" }, FEAT, CLICK);
    expect(labels(items)).not.toContain("Reveal in Finder");
  });

  test("its merges and remove run as jobs on that machine", () => {
    const items = rowMenu({ machine: "linux", root: "/r/app" }, FEAT, CLICK);
    const jobs = items.flatMap((i) => jobsFor(i.action, { noWrapper: false }));
    expect(jobs.map((job) => [job.title, job.on])).toEqual([
      ["Merge feat/x into main", "linux"],
      ["Merge feat/x into main", "linux"],
      ["Remove feat/x", "linux"],
    ]);
  });
});

describe("menuHeight", () => {
  test("comes from the item list: the title and padding, plus one row per item", () => {
    expect(menuHeight(0)).toBe(40);
    expect(menuHeight(6)).toBe(40 + 6 * 30);
  });
});

describe("cleanupAction", () => {
  test("every merged worktree, batched by repo; repos with none are left out", () => {
    const repos = [
      {
        machine: THIS_MACHINE,
        root: "/r/app",
        worktrees: [
          wt("/r/app", "main", MAIN),
          wt("/r/app.a", "a", MERGED),
          wt("/r/app.b", null, MERGED, { dirty: true }),
          wt("/r/app.c", "c", ACTIVE),
        ],
      },
      { machine: THIS_MACHINE, root: "/r/lib", worktrees: [wt("/r/lib", "main", MAIN)] },
      { machine: THIS_MACHINE, root: "/r/web", worktrees: [wt("/r/web.d", "d", MERGED)] },
    ];
    expect(cleanupAction(repos)).toEqual(
      Option.some({
        _tag: "Cleanup",
        batches: [
          {
            machine: THIS_MACHINE,
            main: "/r/app",
            branches: ["a", "/r/app.b"],
            paths: ["/r/app.a", "/r/app.b"],
          },
          { machine: THIS_MACHINE, main: "/r/web", branches: ["d"], paths: ["/r/web.d"] },
        ],
        dirty: 1,
      }),
    );
  });

  test("a New worktree is never cleaned up", () => {
    const fresh = wt("/r/app.new", "new", { _tag: "New" });
    const worktrees = [fresh, wt("/r/app.a", "a", MERGED)];
    expect(cleanupAction([{ ...APP, worktrees }])).toEqual(
      Option.some({
        _tag: "Cleanup",
        batches: [{ machine: THIS_MACHINE, main: "/r/app", branches: ["a"], paths: ["/r/app.a"] }],
        dirty: 0,
      }),
    );
    expect(repoMenu({ machine: THIS_MACHINE, root: "/r/app" }, [fresh])).not.toContainEqual(
      expect.objectContaining({ action: expect.objectContaining({ _tag: "Cleanup" }) }),
    );
  });

  test("nothing merged, nothing to clean up", () => {
    expect(cleanupAction([{ ...APP, worktrees: [FEAT] }])).toEqual(Option.none());
    expect(cleanupAction([])).toEqual(Option.none());
  });
});

describe("repoMenu", () => {
  const worktrees = [wt("/r/app", "main", MAIN), wt("/r/app.a", "a", MERGED), FEAT];

  test("new or open worktree, clean up with the merged count, refresh, reveal, hide", () => {
    expect(labels(repoMenu(APP, worktrees))).toEqual([
      "New or open worktree…",
      "Clean up 1 merged…",
      "Refresh",
      "Reveal in Finder",
      "Hide this repo",
    ]);
  });

  test("no clean up item when nothing is merged", () => {
    expect(labels(repoMenu(APP, [FEAT]))).not.toContain("Clean up 0 merged…");
    expect(repoMenu(APP, [FEAT])).toHaveLength(4);
  });

  test("its items act on this repo; only Clean up is destructive", () => {
    const items = repoMenu(APP, worktrees);
    expect(items.map((i) => [i.action._tag, i.danger])).toEqual([
      ["NewOrOpen", false],
      ["Cleanup", true],
      ["Refresh", false],
      ["Reveal", false],
      ["Hide", false],
    ]);
    expect([items[0]?.action, items[3]?.action, items[4]?.action]).toEqual([
      { _tag: "NewOrOpen", folder: "/r/app" },
      { _tag: "Reveal", path: "/r/app" },
      { _tag: "Hide", machine: THIS_MACHINE, root: "/r/app" },
    ]);
  });
});

describe("repoMenu on another machine", () => {
  test("hides the repo on its own machine", () => {
    const items = repoMenu({ machine: "linux", root: "/r/app" }, [FEAT]);
    expect(items.find((i) => i.action._tag === "Hide")?.action).toEqual({
      _tag: "Hide",
      machine: "linux",
      root: "/r/app",
    });
  });

  test("offers no Reveal in Finder: the folder isn't on this machine", () => {
    const items = repoMenu({ machine: "linux", root: "/r/app" }, [FEAT]);
    expect(labels(items)).not.toContain("Reveal in Finder");
  });
});

describe("findWorktree", () => {
  const list = (worktrees: readonly Worktree[]): RepoList => ({
    _tag: "Read",
    worktrees,
    error: Option.none(),
  });
  const lists = new Map([
    ["/r/app", list([wt("/r/app", "main", MAIN), FEAT])],
    ["/r/lib", list([wt("/r/lib", "main", MAIN), wt("/r/lib.y", "y", MERGED)])],
  ]);

  test("the worktree at a path, with its repo's machine and main checkout", () => {
    expect(findWorktree(lists, "/r/lib.y")).toEqual(
      Option.some({ machine: THIS_MACHINE, root: "/r/lib", worktree: wt("/r/lib.y", "y", MERGED) }),
    );
  });

  test("a row key names the machine: the same folder on another machine is another worktree", () => {
    const both = new Map([
      [repoKey({ machine: THIS_MACHINE, root: "/r/lib" }), list([wt("/r/lib.y", "y", ACTIVE)])],
      [repoKey({ machine: "linux", root: "/r/lib" }), list([wt("/r/lib.y", "y", MERGED)])],
    ]);
    expect(findWorktree(both, repoKey({ machine: "linux", root: "/r/lib.y" }))).toEqual(
      Option.some({ machine: "linux", root: "/r/lib", worktree: wt("/r/lib.y", "y", MERGED) }),
    );
  });

  test("none for a path no list holds", () => {
    expect(findWorktree(lists, "/r/nowhere")).toEqual(Option.none());
  });

  test("cleanupFor removes the merged worktrees among the paths, batched by repo", () => {
    const more = new Map([...lists, ["/r/web", list([wt("/r/web.z", "z", MERGED)])]]);
    expect(cleanupFor(more, ["/r/web.z", "/r/app.feat-x", "/r/lib.y"])).toEqual(
      Option.some({
        _tag: "Cleanup",
        batches: [
          { machine: THIS_MACHINE, main: "/r/web", branches: ["z"], paths: ["/r/web.z"] },
          { machine: THIS_MACHINE, main: "/r/lib", branches: ["y"], paths: ["/r/lib.y"] },
        ],
        dirty: 0,
      }),
    );
  });

  test("cleanupFor's batches name their repo's machine", () => {
    const two = new Map([
      [repoKey({ machine: THIS_MACHINE, root: "/r/lib" }), list([wt("/r/lib.y", "y", MERGED)])],
      [repoKey({ machine: "linux", root: "/srv/api" }), list([wt("/srv/api.z", "z", MERGED)])],
    ]);
    const keys = ["/r/lib.y", repoKey({ machine: "linux", root: "/srv/api.z" })];
    const batches = Option.map(cleanupFor(two, keys), (a) => a.batches.map((b) => b.machine));
    expect(batches).toEqual(Option.some([THIS_MACHINE, "linux"]));
  });

  test("cleanupFor batches the same folder on two machines apart", () => {
    const two = new Map([
      [repoKey({ machine: THIS_MACHINE, root: "/r/lib" }), list([wt("/r/lib.y", "y", MERGED)])],
      [repoKey({ machine: "linux", root: "/r/lib" }), list([wt("/r/lib.z", "z", MERGED)])],
    ]);
    const keys = ["/r/lib.y", repoKey({ machine: "linux", root: "/r/lib.z" })];
    const batches = Option.map(cleanupFor(two, keys), (a) => a.batches);
    expect(batches).toEqual(
      Option.some([
        { machine: THIS_MACHINE, main: "/r/lib", branches: ["y"], paths: ["/r/lib.y"] },
        { machine: "linux", main: "/r/lib", branches: ["z"], paths: ["/r/lib.z"] },
      ]),
    );
  });

  test("cleanupFor is none with no merged worktree among the paths", () => {
    expect(cleanupFor(lists, ["/r/app.feat-x", "/r/nowhere"])).toEqual(Option.none());
  });
});

describe("confirmFor", () => {
  const target = {
    machine: THIS_MACHINE,
    main: "/r/app",
    path: "/r/app.feat-x",
    branch: "feat/x",
  };
  const SPACES = "Spaces open on a removed worktree close.";

  test("a squash merge names the branch and says what happens", () => {
    expect(confirmFor({ _tag: "Merge", target, mode: "squash", dirty: false })).toEqual(
      Option.some({
        title: "Merge feat/x into main?",
        lines: [
          "Its commits become one commit on main.",
          "Then the worktree is removed, and its branch with it.",
          SPACES,
        ],
        go: "Merge",
        danger: false,
      }),
    );
  });

  test("a merge that keeps every commit says so", () => {
    const asked = confirmFor({ _tag: "Merge", target, mode: "keep", dirty: false });
    expect(Option.map(asked, (c) => c.lines[0])).toEqual(
      Option.some("Every commit is kept, rebased onto main."),
    );
  });

  test("merging a worktree with uncommitted changes says they are committed first", () => {
    const asked = confirmFor({ _tag: "Merge", target, mode: "squash", dirty: true });
    expect(Option.map(asked, (c) => c.lines)).toEqual(
      Option.some([
        "Its commits become one commit on main.",
        "Then the worktree is removed, and its branch with it.",
        "Its uncommitted changes are committed first.",
        SPACES,
      ]),
    );
  });

  test("removing a worktree with uncommitted changes warns about them, in red", () => {
    expect(confirmFor({ _tag: "Remove", target, dirty: true })).toEqual(
      Option.some({
        title: "Remove feat/x?",
        lines: [
          "The worktree's folder is removed; its branch too, if it is merged.",
          "It has uncommitted changes: wt stops rather than lose them.",
          SPACES,
        ],
        go: "Remove",
        danger: true,
      }),
    );
  });

  test("removing a detached worktree names its folder", () => {
    const detached = {
      machine: THIS_MACHINE,
      main: "/r/app",
      path: "/r/app.tmp",
      branch: "/r/app.tmp",
    };
    const asked = confirmFor({ _tag: "Remove", target: detached, dirty: false });
    expect(Option.map(asked, (c) => [c.title, c.lines.length])).toEqual(
      Option.some(["Remove app.tmp?", 2]),
    );
  });

  test("clean up counts the worktrees and lists each repo's", () => {
    const action = {
      _tag: "Cleanup" as const,
      batches: [
        {
          machine: THIS_MACHINE,
          main: "/r/app",
          branches: ["a", "b"],
          paths: ["/r/app.a", "/r/app.b"],
        },
        { machine: THIS_MACHINE, main: "/r/lib", branches: ["c"], paths: ["/r/lib.c"] },
      ],
      dirty: 1,
    };
    expect(confirmFor(action)).toEqual(
      Option.some({
        title: "Remove 3 merged worktrees?",
        lines: [
          "app: a, b",
          "lib: c",
          "1 with uncommitted changes: wt stops rather than lose them.",
          SPACES,
        ],
        go: "Remove",
        danger: true,
      }),
    );
  });

  test("one merged worktree, none dirty: a singular title and no warning", () => {
    const action = {
      _tag: "Cleanup" as const,
      batches: [{ machine: THIS_MACHINE, main: "/r/app", branches: ["a"], paths: ["/r/app.a"] }],
      dirty: 0,
    };
    expect(Option.map(confirmFor(action), (c) => [c.title, c.lines])).toEqual(
      Option.some(["Remove 1 merged worktree?", ["app: a", SPACES]]),
    );
  });

  test.each([
    { _tag: "Open", click: CLICK },
    { _tag: "NewOrOpen", folder: "/r/app" },
    { _tag: "Create", main: "/r/app", name: "x", base: null, machine: THIS_MACHINE },
    { _tag: "CopyPath", path: "/r/app" },
    { _tag: "Reveal", path: "/r/app" },
    { _tag: "Refresh" },
    { _tag: "Hide", machine: THIS_MACHINE, root: "/r/app" },
  ] as const)("$_tag changes nothing, so it doesn't ask", (action) => {
    expect(confirmFor(action)).toEqual(Option.none());
  });

  test("a space's worktree request doesn't ask itself: the panel asks once it finds the worktree", () => {
    expect(confirmFor({ _tag: "SpaceWorktree", space: "sp1", act: "Remove" })).toEqual(
      Option.none(),
    );
  });
});

describe("dialogHeight", () => {
  test("grows by one line height per line of text, up to a cap", () => {
    expect(dialogHeight(3)).toBe(132 + 3 * 22);
    expect(dialogHeight(4) - dialogHeight(3)).toBe(22);
    expect(dialogHeight(100)).toBe(560);
  });
});

describe("jobsFor", () => {
  const target = {
    machine: THIS_MACHINE,
    main: "/r/app",
    path: "/r/app.feat-x",
    branch: "feat/x",
  };
  const WRAPPED = { noWrapper: false };

  test("a merge runs from the main checkout and checks the worktree's folder after", () => {
    expect(jobsFor({ _tag: "Merge", target, mode: "keep", dirty: false }, WRAPPED)).toEqual([
      {
        title: "Merge feat/x into main",
        cwd: "/r/app",
        body: mergeScript(target, "keep", WRAPPED),
        gone: ["/r/app.feat-x"],
        on: THIS_MACHINE,
      },
    ]);
  });

  test("a remove honours the no-wrapper setting", () => {
    const plain = { noWrapper: true };
    expect(jobsFor({ _tag: "Remove", target, dirty: false }, plain)).toEqual([
      {
        title: "Remove feat/x",
        cwd: "/r/app",
        body: removeScript("/r/app", ["feat/x"], plain),
        gone: ["/r/app.feat-x"],
        on: THIS_MACHINE,
      },
    ]);
  });

  test("a clean up runs from the first repo and checks every removed folder after", () => {
    const batches = [
      { machine: THIS_MACHINE, main: "/r/app", branches: ["a"], paths: ["/r/app.a"] },
      { machine: THIS_MACHINE, main: "/r/lib", branches: ["b"], paths: ["/r/lib.b"] },
    ];
    const action = { _tag: "Cleanup" as const, batches, dirty: 0 };
    expect(jobsFor(action, WRAPPED)).toEqual([
      {
        title: "Clean up 2 merged",
        cwd: "/r/app",
        body: cleanupScript(batches, WRAPPED),
        gone: ["/r/app.a", "/r/lib.b"],
        on: THIS_MACHINE,
      },
    ]);
  });

  test("a clean up across machines is one job per machine, each run and checked there", () => {
    const here = { machine: THIS_MACHINE, main: "/r/app", branches: ["a"], paths: ["/r/app.a"] };
    const linuxApi = { machine: "linux", main: "/srv/api", branches: ["b"], paths: ["/srv/api.b"] };
    const linuxWeb = { machine: "linux", main: "/srv/web", branches: ["c"], paths: ["/srv/web.c"] };
    const action = {
      _tag: "Cleanup" as const,
      batches: [linuxApi, here, linuxWeb],
      dirty: 0,
    };
    expect(jobsFor(action, WRAPPED)).toEqual([
      {
        title: "Clean up 2 merged on linux",
        cwd: "/srv/api",
        body: cleanupScript([linuxApi, linuxWeb], WRAPPED),
        gone: ["/srv/api.b", "/srv/web.c"],
        on: "linux",
      },
      {
        title: "Clean up 1 merged on this machine",
        cwd: "/r/app",
        body: cleanupScript([here], WRAPPED),
        gone: ["/r/app.a"],
        on: THIS_MACHINE,
      },
    ]);
  });

  test("a clean up with nothing in it is no job", () => {
    const empty = { _tag: "Cleanup" as const, batches: [], dirty: 0 };
    expect(jobsFor(empty, WRAPPED)).toEqual([]);
  });

  test.each([
    { _tag: "Open", click: CLICK },
    { _tag: "NewOrOpen", folder: "/r/app" },
    { _tag: "Create", main: "/r/app", name: "x", base: null, machine: THIS_MACHINE },
    { _tag: "CopyPath", path: "/r/app" },
    { _tag: "Reveal", path: "/r/app" },
    { _tag: "Refresh" },
    { _tag: "Hide", machine: THIS_MACHINE, root: "/r/app" },
  ] as const)("$_tag isn't a job", (action) => {
    expect(jobsFor(action, WRAPPED)).toEqual([]);
  });

  test("a space's worktree request isn't a job itself: the Merge or Remove it becomes is", () => {
    expect(jobsFor({ _tag: "SpaceWorktree", space: "sp1", act: "Merge" }, WRAPPED)).toEqual([]);
  });
});

describe("busyNotice", () => {
  test("one job at a time: names the job still running", () => {
    expect(busyNotice("Merge feat into main")).toEqual({
      title: "worktrunk is busy",
      body: 'Wait for "Merge feat into main" to finish.',
    });
  });
});

describe("spaceWorktreeAction", () => {
  const APP = wt("/r/app", "main", MAIN);
  const LIST = [APP, FEAT];

  test("merges the worktree a space sits in, squashing, from any folder inside it", () => {
    expect(spaceWorktreeAction("Merge", APP_REPO, LIST, "/r/app.feat-x/src")).toEqual(
      Result.succeed({
        _tag: "Merge",
        target: { machine: THIS_MACHINE, main: "/r/app", path: "/r/app.feat-x", branch: "feat/x" },
        mode: "squash",
        dirty: false,
      }),
    );
  });

  test("removes it by branch, saying whether it has uncommitted changes", () => {
    const dirty = wt("/r/app.feat-x", "feat/x", ACTIVE, { dirty: true });
    expect(spaceWorktreeAction("Remove", APP_REPO, [APP, dirty], "/r/app.feat-x")).toEqual(
      Result.succeed({
        _tag: "Remove",
        target: { machine: THIS_MACHINE, main: "/r/app", path: "/r/app.feat-x", branch: "feat/x" },
        dirty: true,
      }),
    );
  });

  test("removes a detached worktree by its folder", () => {
    const detached = wt("/r/app.x", null, ACTIVE);
    expect(spaceWorktreeAction("Remove", APP_REPO, [APP, detached], "/r/app.x")).toEqual(
      Result.succeed({
        _tag: "Remove",
        target: { machine: THIS_MACHINE, main: "/r/app", path: "/r/app.x", branch: "/r/app.x" },
        dirty: false,
      }),
    );
  });

  test("picks the deepest worktree when one sits inside another's folder", () => {
    const nested = wt("/r/app/.worktrees/fix", "fix", ACTIVE);
    expect(
      Result.map(
        spaceWorktreeAction("Remove", APP_REPO, [APP, nested], "/r/app/.worktrees/fix/a"),
        (action) => action._tag === "Remove" && action.target.branch,
      ),
    ).toEqual(Result.succeed("fix"));
  });

  test.each(["Merge", "Remove"] as const)("never does a %s of the main checkout", (act) => {
    expect(spaceWorktreeAction(act, APP_REPO, LIST, "/r/app/src")).toEqual(
      Result.fail("app's main checkout can't be merged or removed."),
    );
  });

  test("can't merge a detached worktree", () => {
    const detached = wt("/r/app.x", null, ACTIVE);
    expect(spaceWorktreeAction("Merge", APP_REPO, [APP, detached], "/r/app.x")).toEqual(
      Result.fail("app.x has no branch to merge."),
    );
  });

  test("says so when the folder is in none of the repo's worktrees", () => {
    expect(spaceWorktreeAction("Remove", APP_REPO, LIST, "/elsewhere")).toEqual(
      Result.fail("/elsewhere isn't in a worktree of app."),
    );
  });
});
