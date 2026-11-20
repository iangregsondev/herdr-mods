import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { repoKey, THIS_MACHINE, type RepoKey } from "../src/machines.ts";
import {
  checked,
  closeOrKeep,
  jobRemoved,
  listsRead,
  NO_ORPHANS,
  orphanSpaces,
  orphanCloses,
  goneLanded,
  orphansChanged,
  publishedOrphans,
  worktreesRead,
  waitingOn,
  type ProgramPane,
} from "../src/orphans.ts";
import type { MachineLists, RepoList } from "../src/reads.ts";
import { spacePlaces, type SpaceLike } from "../src/spaces.ts";
import { OrphanFolder, RepoRoot } from "worktrunk-mailbox";
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

/** A repo's kept list, read without error. */
const listed = (...paths: readonly string[]): RepoList => ({
  _tag: "Read",
  worktrees: paths.map(wt),
  error: Option.none(),
});

const APP = repoKey({ machine: THIS_MACHINE, root: "/r/app" });

/** A machine's list read that worked, each repo's read as given. */
const read = (
  ...repos: readonly (readonly [RepoKey, Result.Result<readonly Worktree[], string>])[]
): MachineLists => Result.succeed(new Map(repos));

/** A repo's read that worked, with these worktrees. */
const fresh = (...paths: readonly string[]): Result.Result<readonly Worktree[], string> =>
  Result.succeed(paths.map(wt));

describe("listsRead", () => {
  test("a path missing from a repo's fresh read waits for a check on its machine", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const orphans = listsRead(NO_ORPHANS, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual(["/r/app.feat"]);
  });

  test("a repo's failed read drops nothing", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const orphans = listsRead(NO_ORPHANS, old, THIS_MACHINE, read([APP, Result.fail("boom")]));
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual([]);
  });

  test("a machine that couldn't be read drops nothing", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const down: MachineLists = Result.fail({ _tag: "Down", reason: "offline" });
    expect(waitingOn(listsRead(NO_ORPHANS, old, THIS_MACHINE, down), THIS_MACHINE)).toEqual([]);
  });

  test("a repo the read left out drops nothing", () => {
    const other = repoKey({ machine: THIS_MACHINE, root: "/r/other" });
    const old = new Map([
      [APP, listed("/r/app")],
      [other, listed("/r/other", "/r/other.feat")],
    ]);
    const orphans = listsRead(NO_ORPHANS, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual([]);
  });

  test("folders the panel's own job removed are not dropped paths", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat", "/r/app.fix")]]);
    const removed = jobRemoved(NO_ORPHANS, THIS_MACHINE, ["/r/app.feat"]);
    const orphans = listsRead(removed, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual(["/r/app.fix"]);
  });

  test("a job's removed folder is left out once, so a new worktree there counts again", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const skipped = listsRead(
      jobRemoved(NO_ORPHANS, THIS_MACHINE, ["/r/app.feat"]),
      old,
      THIS_MACHINE,
      read([APP, fresh("/r/app")]),
    );
    const orphans = listsRead(skipped, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual(["/r/app.feat"]);
  });

  test("a job's removed folder listed again on the next read is forgotten, so its later removal in a terminal counts", () => {
    const both = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const remade = listsRead(
      jobRemoved(NO_ORPHANS, THIS_MACHINE, ["/r/app.feat"]),
      both,
      THIS_MACHINE,
      read([APP, fresh("/r/app", "/r/app.feat")]),
    );
    const orphans = listsRead(remade, both, THIS_MACHINE, read([APP, fresh("/r/app")]));
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual(["/r/app.feat"]);
  });

  test("dropped paths wait on their own machine, apart from another's", () => {
    const srv = repoKey({ machine: "linux", root: "/srv/app" });
    const old = new Map([
      [APP, listed("/r/app", "/r/app.feat")],
      [srv, listed("/srv/app", "/srv/app.feat")],
    ]);
    const here = listsRead(NO_ORPHANS, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    const both = listsRead(here, old, "linux", read([srv, fresh("/srv/app")]));
    expect([waitingOn(both, THIS_MACHINE), waitingOn(both, "linux")]).toEqual([
      ["/r/app.feat"],
      ["/srv/app.feat"],
    ]);
  });
});

/** These paths dropped on `machine`, waiting for a check. */
const waiting = (machine: string | null, ...paths: readonly string[]) =>
  listsRead(
    NO_ORPHANS,
    new Map([[APP, listed("/r/app", ...paths)]]),
    machine,
    read([APP, fresh("/r/app")]),
  );

describe("jobRemoved", () => {
  test("a dropped path the panel's own job then removed stops waiting", () => {
    const orphans = jobRemoved(waiting(THIS_MACHINE, "/r/app.feat", "/r/app.fix"), THIS_MACHINE, [
      "/r/app.feat",
    ]);
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual(["/r/app.fix"]);
  });

  test("a job removing an already dropped path leaves nothing behind, so a worktree made there again counts when it goes", () => {
    const byJob = jobRemoved(waiting(THIS_MACHINE, "/r/app.feat"), THIS_MACHINE, ["/r/app.feat"]);
    const remade = listsRead(
      byJob,
      new Map([[APP, listed("/r/app")]]),
      THIS_MACHINE,
      read([APP, fresh("/r/app", "/r/app.feat")]),
    );
    const orphans = listsRead(
      remade,
      new Map([[APP, listed("/r/app", "/r/app.feat")]]),
      THIS_MACHINE,
      read([APP, fresh("/r/app")]),
    );
    expect(waitingOn(orphans, THIS_MACHINE)).toEqual(["/r/app.feat"]);
  });
});

describe("checked", () => {
  test("a gone folder comes back gone and stops waiting", () => {
    const asked = ["/r/app.feat"];
    const after = checked(
      waiting(THIS_MACHINE, ...asked),
      THIS_MACHINE,
      asked,
      Result.succeed(asked),
    );
    expect([after.gone, waitingOn(after.orphans, THIS_MACHINE)]).toEqual([["/r/app.feat"], []]);
  });

  test("a failed check closes nothing, and the paths wait for the next one", () => {
    const asked = ["/r/app.feat"];
    const after = checked(waiting("linux", ...asked), "linux", asked, Result.fail("ssh: no route"));
    expect([after.gone, waitingOn(after.orphans, "linux")]).toEqual([[], ["/r/app.feat"]]);
  });

  test("a dropped path whose folder exists is forgotten, and nothing closes", () => {
    const asked = ["/r/app.feat"];
    const after = checked(waiting(THIS_MACHINE, ...asked), THIS_MACHINE, asked, Result.succeed([]));
    expect([after.gone, waitingOn(after.orphans, THIS_MACHINE)]).toEqual([[], []]);
  });

  test("paths dropped while a check ran wait for the next one", () => {
    const after = checked(
      waiting(THIS_MACHINE, "/r/app.feat", "/r/app.fix"),
      THIS_MACHINE,
      ["/r/app.feat"],
      Result.succeed(["/r/app.feat"]),
    );
    expect([after.gone, waitingOn(after.orphans, THIS_MACHINE)]).toEqual([
      ["/r/app.feat"],
      ["/r/app.fix"],
    ]);
  });

  test("a check that started before the panel's own job removed its folder finds it gone, but never returns it", () => {
    const asked = ["/r/app.feat", "/r/app.fix"];
    const byJob = jobRemoved(waiting(THIS_MACHINE, ...asked), THIS_MACHINE, ["/r/app.feat"]);
    const after = checked(byJob, THIS_MACHINE, asked, Result.succeed(asked));
    expect(after.gone).toEqual(["/r/app.fix"]);
  });
});

const space = (id: string, folder: string, tabs: readonly string[]): SpaceLike => ({
  id,
  folder,
  machine: null,
  active: false,
  tabs: tabs.map((tab) => ({ id: tab })),
});

/** A terminal in `tab` at `cwd`, running a plain shell or something else. */
const terminal = (tab: string, cwd: string, shell: boolean): ProgramPane => ({
  tab,
  cwd,
  terminal: `term-${tab}-${cwd}`,
  program: { shell },
});

describe("closeOrKeep", () => {
  test("a space whose terminals all run a plain shell closes at once", () => {
    const panes = [terminal("t1", "/r/app.feat", true), terminal("t2", "/r/app.feat", true)];
    expect(closeOrKeep(space("s1", "/r/app.feat", ["t1", "t2"]), panes)).toBe("Close");
  });

  test("a space with anything else running in it is kept", () => {
    const panes = [
      terminal("t0", "/r/other", true),
      terminal("t1", "/r/app.feat", true),
      terminal("t2", "/r/app.feat", false),
    ];
    expect(closeOrKeep(space("s1", "/r/app.feat", ["t1", "t2"]), panes)).toBe("Keep");
  });

  test("mod panes in the space don't count", () => {
    const mod: ProgramPane = { tab: "t1", cwd: null, terminal: null };
    const panes = [terminal("t1", "/r/app.feat", true), mod];
    expect(closeOrKeep(space("s1", "/r/app.feat", ["t1"]), panes)).toBe("Close");
  });

  test("a space with only mod panes in it closes at once, since nothing but shells runs there", () => {
    const panes: readonly ProgramPane[] = [
      { tab: "t1", cwd: null, terminal: null },
      { tab: "t2", cwd: null, terminal: null },
    ];
    expect(closeOrKeep(space("s1", "/r/app.feat", ["t1", "t2"]), panes)).toBe("Close");
  });

  test("what runs in another space doesn't count", () => {
    const panes = [terminal("t0", "/r/other", false), terminal("t1", "/r/app.feat", true)];
    expect(closeOrKeep(space("s1", "/r/app.feat", ["t1"]), panes)).toBe("Close");
  });
});

describe("orphanSpaces", () => {
  test("every space on a gone folder is handled, each by what runs in it", () => {
    const spaces = [
      space("s1", "/r/app.feat", ["t1"]),
      space("s2", "/r/app.feat", ["t2"]),
      space("s3", "/r/app", ["t3"]),
    ];
    const panes = [
      terminal("t1", "/r/app.feat", true),
      terminal("t2", "/r/app.feat/src", false),
      terminal("t3", "/r/app", true),
    ];
    expect(orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"])).toEqual([
      { space: "s1", step: "Close", folder: "/r/app.feat" },
      { space: "s2", step: "Keep", folder: "/r/app.feat" },
    ]);
  });

  test("a space matched only by its place, its terminal moved with the worktree, is handled", () => {
    const spaces = [space("s1", "/r", ["t1"])];
    const panes = [terminal("t1", "/r/app.feat", true)];
    expect(orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"])).toEqual([
      { space: "s1", step: "Close", folder: "/r/app.feat" },
    ]);
  });

  test("a space made on the worktree whose shell moved into wt's trash is handled", () => {
    const spaces = [space("s1", "/r/app.feat", ["t1"])];
    const panes = [terminal("t1", "/r/.git/wt-trash/app.feat", true)];
    expect(orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"])).toEqual([
      { space: "s1", step: "Close", folder: "/r/app.feat" },
    ]);
  });

  test("a space on a missing folder that wasn't checked gone is untouched", () => {
    const spaces = [space("s1", "/tmp/deleted", ["t1"])];
    const panes = [terminal("t1", "/tmp/deleted", true)];
    expect(orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"])).toEqual([]);
  });

  test("a space on another machine is handled only by that machine's check", () => {
    const spaces = [{ ...space("s1", "/r/app.feat", ["t1"]), machine: "linux" }];
    const panes = [terminal("t1", "/r/app.feat", true)];
    expect([
      orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"]),
      orphanSpaces(spaces, panes, "linux", ["/r/app.feat"]),
    ]).toEqual([[], [{ space: "s1", step: "Close", folder: "/r/app.feat" }]]);
  });

  test("each orphan carries the gone folder its space was matched by", () => {
    const spaces = [space("s1", "/r", ["t1"]), space("s2", "/r/app.fix", ["t2"])];
    const panes = [terminal("t1", "/r/app.feat/src", true), terminal("t2", "/r/app.fix", false)];
    const found = orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat", "/r/app.fix"]);
    expect(found.map((orphan) => [orphan.space, orphan.folder])).toEqual([
      ["s1", "/r/app.feat"],
      ["s2", "/r/app.fix"],
    ]);
  });
});

describe("orphanCloses", () => {
  test("a busy orphan space seen dropped isn't closed", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const orphans = listsRead(NO_ORPHANS, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    const asked = waitingOn(orphans, THIS_MACHINE);
    const after = checked(orphans, THIS_MACHINE, asked, Result.succeed(asked));
    const spaces = [space("s1", "/r/app.feat", ["t1"])];
    const panes = [terminal("t1", "/r/app.feat", false)];
    expect(orphanCloses(spaces, panes, THIS_MACHINE, after.gone)).toEqual([]);
  });

  test("a shell-only orphan space seen dropped closes at once", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const orphans = listsRead(NO_ORPHANS, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    const asked = waitingOn(orphans, THIS_MACHINE);
    const after = checked(orphans, THIS_MACHINE, asked, Result.succeed(asked));
    const spaces = [space("s1", "/r/app.feat", ["t1"]), space("s2", "/r/app.feat", ["t2"])];
    const panes = [terminal("t1", "/r/app.feat", true), terminal("t2", "/r/app.feat", false)];
    expect(orphanCloses(spaces, panes, THIS_MACHINE, after.gone)).toEqual(["s1"]);
  });

  test("a shell-only orphan space found only by the wider check is not closed", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat", "/r/app.old")]]);
    const orphans = listsRead(
      NO_ORPHANS,
      old,
      THIS_MACHINE,
      read([APP, fresh("/r/app", "/r/app.old")]),
    );
    const asked = waitingOn(orphans, THIS_MACHINE);
    const after = checked(
      orphans,
      THIS_MACHINE,
      asked,
      Result.succeed(["/r/app.feat", "/r/app.old"]),
    );
    const spaces = [space("s1", "/r/app.feat", ["t1"]), space("s2", "/r/app.old", ["t2"])];
    const panes = [terminal("t1", "/r/app.feat", true), terminal("t2", "/r/app.old", true)];
    const wider = publishedOrphans(
      spaces,
      spacePlaces(spaces, panes),
      new Map([[THIS_MACHINE, ["/r/app.feat", "/r/app.old"]]]),
      worktreesRead([], old),
    );
    expect([Object.keys(wider), orphanCloses(spaces, panes, THIS_MACHINE, after.gone)]).toEqual([
      ["s1", "s2"],
      ["s1"],
    ]);
  });
});

describe("publishedOrphans", () => {
  test("a space on a gone folder whose place is in wt's trash names its repo from the place, the trashed place gone too", () => {
    const spaces = [space("s1", "/r/app.feat", ["t1"])];
    const places = spacePlaces(spaces, [
      terminal("t1", "/r/app/.git/wt/trash/app.feat-1a2b", false),
    ]);
    expect(
      publishedOrphans(spaces, places, new Map([[THIS_MACHINE, ["/r/app.feat"]]]), []),
    ).toEqual({ s1: { folder: "/r/app.feat", repo: "/r/app" } });
  });

  test("a space whose gone folder was a worktree in a list the panel read names that list's repo", () => {
    const spaces = [space("s1", "/r/app.feat", ["t1"])];
    const places = spacePlaces(spaces, [terminal("t1", "/r/app.feat/src", false)]);
    expect(
      publishedOrphans(spaces, places, new Map([[THIS_MACHINE, ["/r/app.feat"]]]), [
        { machine: THIS_MACHINE, path: "/r/app", repo: "/r/app" },
        { machine: THIS_MACHINE, path: "/r/app.feat", repo: "/r/app" },
      ]),
    ).toEqual({ s1: { folder: "/r/app.feat", repo: "/r/app" } });
  });

  test("a space on any other gone folder, its repo unknown, is no orphan", () => {
    const spaces = [space("s1", "/tmp/scratch", ["t1"]), space("s2", "/r/app.x", ["t2"])];
    const places = spacePlaces(spaces, [
      terminal("t1", "/tmp/scratch", false),
      terminal("t2", "/r/app/.git/hooks", false),
    ]);
    expect(
      publishedOrphans(spaces, places, new Map([[THIS_MACHINE, ["/tmp/scratch", "/r/app.x"]]]), [
        { machine: THIS_MACHINE, path: "/r/app", repo: "/r/app" },
      ]),
    ).toEqual({});
  });

  test("each space counts only its own machine's gone folders and lists", () => {
    const on = (id: string, machine: string | null, folder: string): SpaceLike => ({
      ...space(id, folder, [`t-${id}`]),
      machine,
    });
    const spaces = [
      on("here", THIS_MACHINE, "/r/app.feat"),
      on("box", "linux", "/r/app.feat"),
      on("box-listed-here", "linux", "/r/app.other"),
    ];
    const places = spacePlaces(
      spaces,
      spaces.map((s) => terminal(`t-${s.id}`, `${s.folder}/src`, false)),
    );
    const gone = new Map<string | null, readonly string[]>([
      [THIS_MACHINE, []],
      ["linux", ["/r/app.feat", "/r/app.other"]],
    ]);
    expect(
      publishedOrphans(spaces, places, gone, [
        { machine: "linux", path: "/r/app.feat", repo: "/r/app" },
        { machine: THIS_MACHINE, path: "/r/app.feat", repo: "/r/app" },
        { machine: THIS_MACHINE, path: "/r/app.other", repo: "/r/app" },
      ]),
    ).toEqual({ box: { folder: "/r/app.feat", repo: "/r/app" } });
  });
});

describe("worktreesRead", () => {
  test("adds each listed worktree, on its repo's machine, to those read before, each once", () => {
    const BOX = repoKey({ machine: "linux", root: "/srv/api" });
    const before = [{ machine: THIS_MACHINE, path: "/r/app.gone", repo: "/r/app" }];
    expect(
      worktreesRead(
        before,
        new Map([
          [APP, listed("/r/app", "/r/app.gone")],
          [BOX, listed("/srv/api", "/srv/api.feat")],
        ]),
      ),
    ).toEqual([
      { machine: THIS_MACHINE, path: "/r/app.gone", repo: "/r/app" },
      { machine: THIS_MACHINE, path: "/r/app", repo: "/r/app" },
      { machine: "linux", path: "/srv/api", repo: "/srv/api" },
      { machine: "linux", path: "/srv/api.feat", repo: "/srv/api" },
    ]);
  });
});

describe("goneLanded", () => {
  test("a search that worked sets its machine's gone folders; one that failed keeps the last", () => {
    const before = new Map<string | null, readonly string[]>([
      [THIS_MACHINE, ["/r/a.old"]],
      ["linux", ["/srv/b.old"]],
    ]);
    const worked = goneLanded(before, THIS_MACHINE, Result.succeed({ gone: ["/r/c.old"] }));
    const failed = goneLanded(worked, "linux", Result.fail({ _tag: "Down", reason: "ssh" }));
    expect(failed).toEqual(
      new Map<string | null, readonly string[]>([
        [THIS_MACHINE, ["/r/c.old"]],
        ["linux", ["/srv/b.old"]],
      ]),
    );
  });
});

describe("orphansChanged", () => {
  const one = { s1: { folder: OrphanFolder("/r/app.feat"), repo: RepoRoot("/r/app") } };

  test("the same orphans as published are no change", () => {
    expect(orphansChanged(one, { s1: { folder: "/r/app.feat", repo: "/r/app" } })).toBe(false);
    expect(orphansChanged({}, {})).toBe(false);
  });

  test("nothing published yet and no orphans found is no change", () => {
    expect(orphansChanged({}, undefined)).toBe(false);
    expect(orphansChanged({}, null)).toBe(false);
  });

  test("an orphan added, gone, or with another folder or repo, or a published value of another shape, is a change", () => {
    expect(orphansChanged(one, {})).toBe(true);
    expect(orphansChanged({}, one)).toBe(true);
    expect(orphansChanged(one, { s1: { folder: "/r/app.x", repo: "/r/app" } })).toBe(true);
    expect(orphansChanged(one, { s1: { folder: "/r/app.feat", repo: "/r/web" } })).toBe(true);
    expect(orphansChanged(one, { s2: one.s1 })).toBe(true);
    expect(orphansChanged(one, undefined)).toBe(true);
    expect(orphansChanged(one, { s1: "/r/app" })).toBe(true);
  });
});
