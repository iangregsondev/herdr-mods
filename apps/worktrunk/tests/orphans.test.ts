import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { repoKey, THIS_MACHINE, type RepoKey } from "../src/machines.ts";
import {
  askToasts,
  checked,
  closeOrAsk,
  jobRemoved,
  listsRead,
  NO_ORPHANS,
  orphanSpaces,
  orphanSteps,
  waitingOn,
  type NamedSpace,
  type Orphan,
  type ProgramPane,
} from "../src/orphans.ts";
import type { MachineLists, RepoList } from "../src/reads.ts";
import type { SpaceLike } from "../src/spaces.ts";
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

describe("closeOrAsk", () => {
  test("a space whose terminals all run a plain shell closes at once", () => {
    const panes = [terminal("t1", "/r/app.feat", true), terminal("t2", "/r/app.feat", true)];
    expect(closeOrAsk(space("s1", "/r/app.feat", ["t1", "t2"]), panes)).toBe("Close");
  });

  test("a space with anything else running in it is asked about", () => {
    const panes = [
      terminal("t0", "/r/other", true),
      terminal("t1", "/r/app.feat", true),
      terminal("t2", "/r/app.feat", false),
    ];
    expect(closeOrAsk(space("s1", "/r/app.feat", ["t1", "t2"]), panes)).toBe("Ask");
  });

  test("mod panes in the space don't count", () => {
    const mod: ProgramPane = { tab: "t1", cwd: null, terminal: null };
    const panes = [terminal("t1", "/r/app.feat", true), mod];
    expect(closeOrAsk(space("s1", "/r/app.feat", ["t1"]), panes)).toBe("Close");
  });

  test("a space with only mod panes in it closes at once, since nothing but shells runs there", () => {
    const panes: readonly ProgramPane[] = [
      { tab: "t1", cwd: null, terminal: null },
      { tab: "t2", cwd: null, terminal: null },
    ];
    expect(closeOrAsk(space("s1", "/r/app.feat", ["t1", "t2"]), panes)).toBe("Close");
  });

  test("what runs in another space doesn't count", () => {
    const panes = [terminal("t0", "/r/other", false), terminal("t1", "/r/app.feat", true)];
    expect(closeOrAsk(space("s1", "/r/app.feat", ["t1"]), panes)).toBe("Close");
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
      { space: "s2", step: "Ask", folder: "/r/app.feat" },
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

/** A space as `spaces()` gives it, with its name. */
const named = (id: string, name: string, folder: string, tabs: readonly string[]): NamedSpace => ({
  ...space(id, folder, tabs),
  name,
});

describe("askToasts", () => {
  test("a space on a gone folder where an agent runs gets a warning toast that closes it with Herdr's confirm", () => {
    const spaces = [named("s1", "app feat", "/r/app.feat", ["t1"])];
    const panes = [terminal("t1", "/r/app.feat", false)];
    expect(
      askToasts(NO_ORPHANS, spaces, orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"]))
        .toasts,
    ).toEqual([
      {
        title: "Space on a removed worktree",
        body: "app feat is on /r/app.feat, which is gone. Something is still running in it. Click to close it.",
        level: "warning",
        action: { name: "space.close", args: { id: "s1", confirmed: false } },
      },
    ]);
  });

  test("no toast for a space closed at once, where only shells run", () => {
    const spaces = [
      named("s1", "app feat", "/r/app.feat", ["t1"]),
      named("s2", "app feat 2", "/r/app.feat", ["t2"]),
    ];
    const panes = [terminal("t1", "/r/app.feat", true), terminal("t2", "/r/app.feat", false)];
    const { toasts } = askToasts(
      NO_ORPHANS,
      spaces,
      orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"]),
    );
    expect(toasts.map((toast) => toast.action.args.id)).toEqual(["s2"]);
  });

  test("a space is asked about once, never again on later checks", () => {
    const spaces = [named("s1", "app feat", "/r/app.feat", ["t1"])];
    const panes = [terminal("t1", "/r/app.feat", false)];
    const first = askToasts(
      NO_ORPHANS,
      spaces,
      orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"]),
    );
    const again = askToasts(
      first.orphans,
      spaces,
      orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"]),
    );
    expect([first.toasts.length, again.toasts.length]).toEqual([1, 0]);
  });

  test("asking about one space still asks about another", () => {
    const panes = [terminal("t1", "/r/app.feat", false), terminal("t2", "/r/app.fix", false)];
    const feat = [named("s1", "app feat", "/r/app.feat", ["t1"])];
    const fix = [named("s2", "app fix", "/r/app.fix", ["t2"])];
    const first = askToasts(
      NO_ORPHANS,
      feat,
      orphanSpaces(feat, panes, THIS_MACHINE, ["/r/app.feat"]),
    );
    const next = askToasts(
      first.orphans,
      fix,
      orphanSpaces(fix, panes, THIS_MACHINE, ["/r/app.fix"]),
    );
    expect(next.toasts.map((toast) => toast.action.args.id)).toEqual(["s2"]);
  });

  test("no toast for a space on a folder the panel's own job removed, though the space list lags", () => {
    const old = new Map([[APP, listed("/r/app", "/r/app.feat")]]);
    const byJob = jobRemoved(NO_ORPHANS, THIS_MACHINE, ["/r/app.feat"]);
    const orphans = listsRead(byJob, old, THIS_MACHINE, read([APP, fresh("/r/app")]));
    const asked = waitingOn(orphans, THIS_MACHINE);
    const after = checked(orphans, THIS_MACHINE, asked, Result.succeed(asked));
    const spaces = [named("s1", "app feat", "/r/app.feat", ["t1"])];
    const panes = [terminal("t1", "/r/app.feat", false)];
    expect(
      askToasts(after.orphans, spaces, orphanSpaces(spaces, panes, THIS_MACHINE, after.gone))
        .toasts,
    ).toEqual([]);
  });

  test("the toast names the gone folder a space is on by its place when it was made elsewhere", () => {
    const spaces = [named("s1", "app", "/r", ["t1"])];
    const panes = [terminal("t1", "/r/app.feat/src", false)];
    const { toasts } = askToasts(
      NO_ORPHANS,
      spaces,
      orphanSpaces(spaces, panes, THIS_MACHINE, ["/r/app.feat"]),
    );
    expect(toasts.map((toast) => toast.body)).toEqual([
      "app is on /r/app.feat, which is gone. Something is still running in it. Click to close it.",
    ]);
  });

  test("the toast names the gone folder its orphan was matched by", () => {
    const spaces = [named("s1", "app", "/r", ["t1"])];
    const found: readonly Orphan[] = [{ space: "s1", step: "Ask", folder: "/r/app.fix" }];
    expect(askToasts(NO_ORPHANS, spaces, found).toasts.map((toast) => toast.body)).toEqual([
      "app is on /r/app.fix, which is gone. Something is still running in it. Click to close it.",
    ]);
  });
});

describe("orphanSteps", () => {
  test("the spaces where only shells run close at once and the others are asked about", () => {
    const spaces = [
      named("s1", "app feat", "/r/app.feat", ["t1"]),
      named("s2", "app feat 2", "/r/app.feat", ["t2"]),
      named("s3", "app", "/r/app", ["t3"]),
    ];
    const panes = [
      terminal("t1", "/r/app.feat", true),
      terminal("t2", "/r/app.feat", false),
      terminal("t3", "/r/app", false),
    ];
    const steps = orphanSteps(NO_ORPHANS, spaces, panes, THIS_MACHINE, ["/r/app.feat"]);
    expect([steps.closes, steps.toasts.map((toast) => toast.action.args.id)]).toEqual([
      ["s1"],
      ["s2"],
    ]);
  });
});
