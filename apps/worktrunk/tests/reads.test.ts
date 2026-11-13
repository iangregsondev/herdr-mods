import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  askRefresh,
  ciDue,
  currentRepoOf,
  foldCi,
  foldList,
  followFocus,
  IDLE,
  NO_READS,
  NOT_FOLLOWING,
  onRender,
  refreshDone,
  scanDue,
  takeLookup,
} from "../src/reads.ts";
import { THIS_MACHINE } from "../src/machines.ts";
import type { FoundRepo, Repo } from "../src/repos.ts";
import type { Worktree } from "../src/worktrees.ts";

const wt = (path: string): Worktree => ({
  branch: Option.some(path.split("/").at(-1) ?? path),
  path,
  state: { _tag: "Active" },
  ahead: 0,
  behind: 0,
  added: 0,
  deleted: 0,
  upstream: Option.none(),
  dirty: false,
  ci: { _tag: "Checks", status: "passed", stale: false },
  committedAt: Option.none(),
});

const A = wt("/r/a");
const B = wt("/r/b");

describe("foldList", () => {
  test("a read that works replaces the list and clears the error", () => {
    const old = { _tag: "Read", worktrees: [A], error: Option.some("boom") } as const;
    expect(foldList(Option.some(old), Result.succeed([B]))).toEqual({
      _tag: "Read",
      worktrees: [B],
      error: Option.none(),
    });
  });

  test("a failed read keeps the worktrees from before, with the error", () => {
    const old = { _tag: "Read", worktrees: [A], error: Option.none() } as const;
    expect(foldList(Option.some(old), Result.fail("no repo"))).toEqual({
      _tag: "Read",
      worktrees: [A],
      error: Option.some("no repo"),
    });
  });

  test("a first read that fails has no worktrees", () => {
    expect(foldList(Option.none(), Result.fail("no repo")).worktrees).toEqual([]);
  });
});

describe("foldCi", () => {
  test("a read that works maps each worktree's CI by path", () => {
    const read = foldCi(Option.none(), Result.succeed([A, B]));
    expect(Array.from(read.byPath)).toEqual([
      ["/r/a", A.ci],
      ["/r/b", B.ci],
    ]);
    expect(read.error).toEqual(Option.none());
  });

  test("a failed read keeps the CI from before, with the error", () => {
    const old = foldCi(Option.none(), Result.succeed([A]));
    const read = foldCi(Option.some(old), Result.fail("rate limited"));
    expect(read.byPath).toBe(old.byPath);
    expect(read.error).toEqual(Option.some("rate limited"));
  });

  test("a first read that fails has no CI", () => {
    expect(foldCi(Option.none(), Result.fail("x")).byPath.size).toBe(0);
  });
});

describe("scanDue", () => {
  const last = { key: "k", at: 1_000 };

  test("the first scan is always due", () => {
    expect(scanDue(Option.none(), { forced: false, key: "k", now: 1_000, every: 600 })).toBe(true);
  });

  test("due when asked for", () => {
    expect(scanDue(Option.some(last), { forced: true, key: "k", now: 1_001, every: 600 })).toBe(
      true,
    );
  });

  test("due when the settings changed what to scan", () => {
    expect(scanDue(Option.some(last), { forced: false, key: "k2", now: 1_001, every: 600 })).toBe(
      true,
    );
  });

  test("due once the last scan is older than every, and not before", () => {
    expect(scanDue(Option.some(last), { forced: false, key: "k", now: 1_601, every: 600 })).toBe(
      true,
    );
    expect(scanDue(Option.some(last), { forced: false, key: "k", now: 1_600, every: 600 })).toBe(
      false,
    );
  });
});

describe("ciDue", () => {
  test("the first CI read is always due", () => {
    expect(ciDue(Option.none(), { now: 0, every: 300_000 })).toBe(true);
  });

  test("due once the last CI read is older than every, and not before", () => {
    const last = Option.some(1_000);
    expect(ciDue(last, { now: 301_001, every: 300_000 })).toBe(true);
    expect(ciDue(last, { now: 301_000, every: 300_000 })).toBe(false);
  });
});

describe("askRefresh and refreshDone", () => {
  test("an idle panel starts the refresh asked for", () => {
    expect(askRefresh(IDLE, { scan: false })).toEqual({
      loader: { _tag: "Loading", again: Option.none() },
      start: Option.some({ scan: false }),
    });
  });

  test("asks while loading make one more refresh, scanning if any of them asked to", () => {
    const first = askRefresh(IDLE, { scan: false }).loader;
    const second = askRefresh(first, { scan: true });
    const third = askRefresh(second.loader, { scan: false });
    expect(second.start).toEqual(Option.none());
    expect(third).toEqual({
      loader: { _tag: "Loading", again: Option.some({ scan: true }) },
      start: Option.none(),
    });
  });

  test("when it finishes, it goes idle and hands on the refresh asked for meanwhile", () => {
    const loading = askRefresh(askRefresh(IDLE, { scan: false }).loader, { scan: false }).loader;
    expect(refreshDone(loading)).toEqual({ loader: IDLE, again: Option.some({ scan: false }) });
    expect(refreshDone(askRefresh(IDLE, { scan: true }).loader)).toEqual({
      loader: IDLE,
      again: Option.none(),
    });
  });

  test("finishing while idle changes nothing", () => {
    expect(refreshDone(IDLE)).toEqual({ loader: IDLE, again: Option.none() });
  });
});

describe("onRender", () => {
  test("the first render while shown starts reading, for the chip shown", () => {
    expect(onRender(NO_READS, { shown: true, group: "Work" })).toEqual({
      reads: { started: true, wasHidden: false, group: "Work" },
      step: "Start",
    });
  });

  test("nothing is read while hidden, and showing again reads again", () => {
    const hidden = onRender(NO_READS, { shown: false, group: "" });
    expect(hidden).toEqual({
      reads: { started: false, wasHidden: true, group: "" },
      step: "None",
    });
    const shown = onRender(NO_READS, { shown: true, group: "" }).reads;
    const started = onRender(shown, { shown: false, group: "" });
    expect(started).toEqual({
      reads: { started: true, wasHidden: true, group: "" },
      step: "None",
    });
    expect(onRender(started.reads, { shown: true, group: "" })).toEqual({
      reads: { started: true, wasHidden: false, group: "" },
      step: "Start",
    });
  });

  test("another group chip reads its repos", () => {
    const started = { started: true, wasHidden: false, group: "" };
    expect(onRender(started, { shown: true, group: "Work" })).toEqual({
      reads: { started: true, wasHidden: false, group: "Work" },
      step: "NewGroup",
    });
  });

  test("a chip picked while hidden is read when the panel shows again", () => {
    const hidden = { started: true, wasHidden: true, group: "" };
    expect(onRender(hidden, { shown: false, group: "Work" })).toEqual({
      reads: hidden,
      step: "None",
    });
    expect(onRender(hidden, { shown: true, group: "Work" })).toEqual({
      reads: { started: true, wasHidden: false, group: "Work" },
      step: "Start",
    });
  });

  test("the same chip, still shown, reads nothing more", () => {
    const started = { started: true, wasHidden: false, group: "Work" };
    expect(onRender(started, { shown: true, group: "Work" })).toEqual({
      reads: started,
      step: "None",
    });
  });
});

describe("currentRepoOf", () => {
  const LISTED: Repo = { machine: THIS_MACHINE, root: "/w/api", count: 3, group: "Work" };
  const folders = [{ name: "Work", path: "~/w", machine: THIS_MACHINE }];
  const answer = (found: Option.Option<FoundRepo>) => Option.some(Result.succeed(found));

  test("NotInRepo when the focused folder is in none", () => {
    expect(
      currentRepoOf(answer(Option.none()), [LISTED], folders, new Map([[THIS_MACHINE, "/home"]])),
    ).toEqual({
      _tag: "NotInRepo",
    });
  });

  test("Looking until the first answer", () => {
    expect(
      currentRepoOf(Option.none(), [LISTED], folders, new Map([[THIS_MACHINE, "/home"]])),
    ).toEqual({ _tag: "Looking" });
  });

  test("InRepo with the listed repo, group included", () => {
    const found = answer(Option.some({ machine: THIS_MACHINE, root: "/w/api", count: 1 }));
    expect(currentRepoOf(found, [LISTED], folders, new Map([[THIS_MACHINE, "/home"]]))).toEqual({
      _tag: "InRepo",
      repo: LISTED,
    });
  });

  test("InRepo with a repo the panel doesn't list, grouped by the group folders", () => {
    const found = answer(Option.some({ machine: THIS_MACHINE, root: "/home/w/tool", count: 2 }));
    expect(currentRepoOf(found, [LISTED], folders, new Map([[THIS_MACHINE, "/home"]]))).toEqual({
      _tag: "InRepo",
      repo: { machine: THIS_MACHINE, root: "/home/w/tool", count: 2, group: "Work" },
    });
  });

  test("the same folder on another machine is not the listed repo", () => {
    const found = answer(Option.some({ machine: "linux", root: "/w/api", count: 1 }));
    expect(currentRepoOf(found, [LISTED], folders, new Map([[THIS_MACHINE, "/home"]]))).toEqual({
      _tag: "InRepo",
      repo: { machine: "linux", root: "/w/api", count: 1, group: "Other" },
    });
  });

  test("Failed when the lookup failed, with its reason", () => {
    expect(
      currentRepoOf(
        Option.some(Result.fail("git: boom")),
        [LISTED],
        folders,
        new Map([[THIS_MACHINE, "/home"]]),
      ),
    ).toEqual({
      _tag: "Failed",
      reason: "git: boom",
    });
  });
});

describe("followFocus", () => {
  test("showing the Current view, a focused folder not looked up yet is looked up", () => {
    expect(followFocus(NOT_FOLLOWING, { following: true, folder: "/w/api/src" })).toEqual({
      follow: { folder: Option.some("/w/api/src"), found: Option.none() },
      lookUp: Option.some("/w/api/src"),
    });
  });

  test("the folder last looked up looks nothing up again", () => {
    const follow = { folder: Option.some("/w/api"), found: Option.none() };
    expect(followFocus(follow, { following: true, folder: "/w/api" })).toEqual({
      follow,
      lookUp: Option.none(),
    });
  });

  test("with the view not shown, nothing is looked up, and showing it looks up again", () => {
    const follow = { folder: Option.some("/w/api"), found: Option.none() };
    const hidden = followFocus(follow, { following: false, folder: "/w/api" });
    expect(hidden).toEqual({ follow: { ...follow, folder: Option.none() }, lookUp: Option.none() });
    expect(followFocus(hidden.follow, { following: true, folder: "/w/api" }).lookUp).toEqual(
      Option.some("/w/api"),
    );
  });
});

describe("takeLookup", () => {
  const API: FoundRepo = { machine: THIS_MACHINE, root: "/w/api", count: 2 };
  const following = (
    folder: string,
    found: Option.Option<Result.Result<Option.Option<typeof API>, string>> = Option.none(),
  ) => ({
    folder: Option.some(folder),
    found,
  });

  test("the first answer for the focused folder is kept, and refreshes", () => {
    const answer = Result.succeed(Option.some(API));
    expect(takeLookup(following("/w/api/src"), "/w/api/src", answer)).toEqual({
      follow: following("/w/api/src", Option.some(answer)),
      refresh: true,
    });
  });

  test("an answer for an older focus is dropped", () => {
    const follow = following("/p/web");
    expect(takeLookup(follow, "/w/api", Result.succeed(Option.some(API)))).toEqual({
      follow,
      refresh: false,
    });
  });

  test("an answer naming the same repo as before is kept, and refreshes nothing", () => {
    const before = Option.some(Result.succeed(Option.some(API)));
    const answer = Result.succeed(Option.some({ ...API, count: 3 }));
    expect(takeLookup(following("/w/api.feat", before), "/w/api.feat", answer)).toEqual({
      follow: following("/w/api.feat", Option.some(answer)),
      refresh: false,
    });
  });

  test("an answer naming the same folder on another machine refreshes", () => {
    const before = Option.some(Result.succeed(Option.some(API)));
    const answer = Result.succeed(Option.some({ ...API, machine: "linux" }));
    expect(takeLookup(following("/w/api", before), "/w/api", answer).refresh).toBe(true);
  });

  test("an answer naming another repo than before refreshes", () => {
    const before = Option.some(Result.succeed(Option.some(API)));
    const answer = Result.succeed(Option.none());
    expect(takeLookup(following("/tmp", before), "/tmp", answer).refresh).toBe(true);
  });
});
