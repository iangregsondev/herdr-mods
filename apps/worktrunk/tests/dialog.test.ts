import { THIS_MACHINE } from "../src/machines.ts";
import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  choicesFor,
  enterAction,
  flippedBase,
  highlight,
  linesFor,
  moved,
  openDialog,
  parseBranches,
  pick,
  reposFor,
  retyped,
  type Choice,
  type DialogState,
  withRead,
} from "../src/dialog.ts";
import type { Worktree } from "../src/worktrees.ts";

const wt = (path: string, branch: string | null): Worktree => ({
  branch: Option.fromNullishOr(branch),
  path,
  state: { _tag: "Active" },
  ahead: 0,
  behind: 0,
  added: 0,
  deleted: 0,
  upstream: Option.none(),
  dirty: false,
  ci: { _tag: "NotAsked" },
  committedAt: Option.none(),
});

describe("parseBranches", () => {
  test("local branches, by name", () => {
    expect(parseBranches("refs/heads/main\nrefs/heads/feat/a\n")).toEqual([
      { name: "main", remote: false },
      { name: "feat/a", remote: false },
    ]);
  });

  test("origin's branches, marked remote, without origin's HEAD", () => {
    const output =
      "refs/remotes/origin/HEAD\nrefs/remotes/origin/main\nrefs/remotes/origin/fix/b\n";
    expect(parseBranches(output)).toEqual([
      { name: "main", remote: true },
      { name: "fix/b", remote: true },
    ]);
  });

  test("nothing from empty output, an error or other refs", () => {
    expect(parseBranches("")).toEqual([]);
    expect(parseBranches("fatal: not a git repository\nrefs/tags/v1\n")).toEqual([]);
  });
});

describe("choicesFor", () => {
  const worktrees = [wt("/r/app", "main"), wt("/r/app.feat-login", "feat/login")];
  const branches = [
    { name: "main", remote: false },
    { name: "feat/login", remote: false },
    { name: "fix/logout", remote: false },
    { name: "main", remote: true },
    { name: "fix/logout", remote: true },
    { name: "spike/log", remote: true },
  ];
  const names = (choices: readonly Choice[]) =>
    choices.map((c) => `${c._tag}:${c._tag === "Worktree" ? c.branch : c.name}`);

  test("nothing typed: every worktree first, by its branch and folder", () => {
    expect(choicesFor("", worktrees, [], 10)).toEqual([
      { _tag: "Worktree", branch: "main", path: "/r/app" },
      { _tag: "Worktree", branch: "feat/login", path: "/r/app.feat-login" },
    ]);
  });

  test("nothing typed: then local branches with no worktree, each once", () => {
    const local = branches.filter((b) => !b.remote);
    expect(names(choicesFor("", worktrees, local, 10))).toEqual([
      "Worktree:main",
      "Worktree:feat/login",
      "Branch:fix/logout",
    ]);
  });

  test("nothing typed: then branches only on origin, marked remote, last", () => {
    expect(choicesFor("", worktrees, branches, 10).slice(2)).toEqual([
      { _tag: "Branch", name: "fix/logout", remote: false },
      { _tag: "Branch", name: "spike/log", remote: true },
    ]);
  });

  test("a worktree with no branch (a detached HEAD) is never offered", () => {
    expect(choicesFor("", [wt("/r/app.detached", null)], [], 10)).toEqual([]);
  });

  test("typed text: itself first, as a new branch, then the names holding it, ignoring case", () => {
    expect(names(choicesFor("LOG", worktrees, branches, 10))).toEqual([
      "Typed:LOG",
      "Worktree:feat/login",
      "Branch:fix/logout",
      "Branch:spike/log",
    ]);
    expect(choicesFor("LOG", worktrees, branches, 10)[0]).toEqual({
      _tag: "Typed",
      name: "LOG",
      shortcut: false,
    });
  });

  test("an exact name match takes the typed line's place, first", () => {
    const more = [{ name: "a-fix", remote: false }, ...branches, { name: "fix", remote: false }];
    expect(names(choicesFor("Fix", worktrees, more, 10))[0]).toBe("Branch:fix");
    expect(names(choicesFor("Fix", worktrees, more, 10))).not.toContain("Typed:Fix");
  });

  test("names starting with the text come before names holding it further in", () => {
    const more = [{ name: "a-fix", remote: false }, ...branches, { name: "fix", remote: false }];
    expect(names(choicesFor("fix", worktrees, more, 10))).toEqual([
      "Branch:fix",
      "Branch:fix/logout",
      "Branch:a-fix",
    ]);
  });

  test.each([" pr:12 ", "mr:3", "https://github.com/o/r/pull/7"])(
    "%s is the typed text alone, marked as a wt shortcut",
    (typed) => {
      const withPr = [
        ...branches,
        { name: "pr:12", remote: false },
        { name: "mr:3", remote: false },
      ];
      expect(choicesFor(typed, worktrees, withPr, 10)).toEqual([
        { _tag: "Typed", name: typed.trim(), shortcut: true },
      ]);
    },
  );

  test("at most `limit` lines, the typed line included; none for a limit below one", () => {
    expect(names(choicesFor("o", worktrees, branches, 2))).toEqual([
      "Typed:o",
      "Worktree:feat/login",
    ]);
    expect(choicesFor("o", worktrees, branches, -1)).toEqual([]);
  });
});

describe("enterAction", () => {
  const on = Option.some("feat/a");

  test("a worktree or a branch is switched to by its branch name", () => {
    const worktree: Choice = { _tag: "Worktree", branch: "feat/login", path: "/r/x" };
    const branch: Choice = { _tag: "Branch", name: "spike", remote: true };
    expect([
      enterAction("/r/app", worktree, "default", on),
      enterAction("/r/app", branch, "default", on),
    ]).toEqual([
      { _tag: "Create", machine: THIS_MACHINE, main: "/r/app", name: "feat/login", base: null },
      { _tag: "Create", machine: THIS_MACHINE, main: "/r/app", name: "spike", base: null },
    ]);
  });

  const typed: Choice = { _tag: "Typed", name: "new", shortcut: false };

  test("the dialog's repos are this machine's, so its Create runs on this machine", () => {
    expect(enterAction("/r/app", typed, "default", on)).toHaveProperty("machine", THIS_MACHINE);
  });

  test("the default branch as the base leaves the base to wt", () => {
    expect(enterAction("/r/app", typed, "default", on)).toEqual({
      _tag: "Create",
      machine: THIS_MACHINE,
      main: "/r/app",
      name: "new",
      base: null,
    });
  });

  test("the branch I'm on as the base", () => {
    expect(enterAction("/r/app", typed, "current", on)).toEqual({
      _tag: "Create",
      machine: THIS_MACHINE,
      main: "/r/app",
      name: "new",
      base: "feat/a",
    });
  });

  test("the branch I'm on, when there is none, falls back to the default branch", () => {
    expect(enterAction("/r/app", typed, "current", Option.none())).toEqual({
      _tag: "Create",
      machine: THIS_MACHINE,
      main: "/r/app",
      name: "new",
      base: null,
    });
  });
});

describe("reposFor", () => {
  const repos = ["/w/api", "/w/web-app", "/p/app", "/p/notes"];

  test("nothing typed: every repo, in the order given", () => {
    expect(reposFor("  ", repos)).toEqual(repos);
  });

  test("typed text: by folder name, exact then prefix then anywhere, ignoring case", () => {
    expect(reposFor("APP", [...repos, "/w/apples"])).toEqual(["/p/app", "/w/apples", "/w/web-app"]);
  });
});

describe("openDialog", () => {
  test("with a repo: works in it, reading it, the default branch as the base", () => {
    const props = { repo: Option.some("/r/app"), branch: Option.some("feat/a"), repos: ["/r/app"] };
    expect(openDialog(props)).toEqual({
      repo: Option.some("/r/app"),
      current: Option.some("feat/a"),
      repos: ["/r/app"],
      worktrees: [],
      branches: [],
      reading: true,
      error: Option.none(),
      base: "default",
      at: 0,
    } satisfies DialogState);
  });

  test("with no repo: asks for one, reading nothing", () => {
    const props = { repo: Option.none(), branch: Option.none(), repos: ["/r/app", "/r/web"] };
    expect([openDialog(props).repo, openDialog(props).reading]).toEqual([Option.none(), false]);
  });
});

describe("linesFor", () => {
  const picking = openDialog({
    repo: Option.none(),
    branch: Option.none(),
    repos: ["/w/api", "/w/web-app", "/p/app"],
  });

  test("while it asks for a repo: the repos matching the typed text", () => {
    expect(linesFor(picking, "app")).toEqual([
      { _tag: "Repo", root: "/p/app" },
      { _tag: "Repo", root: "/w/web-app" },
    ]);
  });

  test("in a repo: its worktrees and branches matching the typed text", () => {
    const state: DialogState = {
      ...openDialog({ repo: Option.some("/r/app"), branch: Option.none(), repos: [] }),
      worktrees: [wt("/r/app.feat-login", "feat/login")],
      branches: [{ name: "fix/logout", remote: false }],
    };
    expect(linesFor(state, "log")).toEqual([
      { _tag: "Typed", name: "log", shortcut: false },
      { _tag: "Worktree", branch: "feat/login", path: "/r/app.feat-login" },
      { _tag: "Branch", name: "fix/logout", remote: false },
    ]);
  });

  test("in a repo: at most 50 lines", () => {
    const state: DialogState = {
      ...openDialog({ repo: Option.some("/r/app"), branch: Option.none(), repos: [] }),
      branches: Array.from({ length: 60 }, (_, i) => ({ name: `b${i}`, remote: false })),
    };
    expect(linesFor(state, "").length).toBe(50);
  });
});

describe("withRead", () => {
  const reading = openDialog({ repo: Option.some("/r/app"), branch: Option.none(), repos: [] });
  const list = [wt("/r/app", "main")];
  const refs = [{ name: "fix", remote: false }];

  test("keeps the repo's worktrees and branches, and the read is over", () => {
    expect(withRead(reading, Result.succeed(list), Result.succeed(refs))).toEqual({
      ...reading,
      worktrees: list,
      branches: refs,
      reading: false,
    });
  });

  test("a list that couldn't be read is its reason; the branches are still offered", () => {
    const read = withRead(
      reading,
      Result.fail("fatal: not a git repository"),
      Result.succeed(refs),
    );
    expect([read.error, read.worktrees, read.branches, read.reading]).toEqual([
      Option.some("fatal: not a git repository"),
      [],
      refs,
      false,
    ]);
  });

  test("branches that couldn't be read are their reason; the worktrees are still offered", () => {
    const read = withRead(reading, Result.succeed(list), Result.fail("git: not found"));
    expect([read.error, read.worktrees, read.branches]).toEqual([
      Option.some("git: not found"),
      list,
      [],
    ]);
  });

  test("when both fail, both reasons show", () => {
    expect(withRead(reading, Result.fail("wt: boom"), Result.fail("git: boom")).error).toEqual(
      Option.some("wt: boom · git: boom"),
    );
  });
});

describe("moving the highlight", () => {
  const state = openDialog({ repo: Option.some("/r/app"), branch: Option.none(), repos: [] });
  const lines: readonly Choice[] = ["a", "b", "c"].map((name) => ({
    _tag: "Branch",
    name,
    remote: false,
  }));

  test("the highlight stays on the last line when the list gets shorter", () => {
    expect([highlight({ ...state, at: 5 }, lines), highlight({ ...state, at: 5 }, [])]).toEqual([
      2, 0,
    ]);
  });

  test("down moves to the next line, and from the last back to the first", () => {
    expect([moved(state, lines, 1).at, moved({ ...state, at: 2 }, lines, 1).at]).toEqual([1, 0]);
  });

  test("up moves to the line before, and from the first round to the last", () => {
    expect([moved({ ...state, at: 2 }, lines, -1).at, moved(state, lines, -1).at]).toEqual([1, 2]);
  });

  test("typing puts the highlight back on the first line", () => {
    expect(retyped({ ...state, at: 2 }).at).toBe(0);
  });
});

describe("flippedBase", () => {
  const on = openDialog({ repo: Option.some("/r/app"), branch: Option.some("feat/a"), repos: [] });

  test("Tab switches between the default branch and the branch I'm on", () => {
    expect([flippedBase(on).base, flippedBase(flippedBase(on)).base]).toEqual([
      "current",
      "default",
    ]);
  });

  test("with no branch I'm on, the base stays the default branch", () => {
    expect(flippedBase({ ...on, current: Option.none() }).base).toBe("default");
  });
});

describe("pick", () => {
  const picking: DialogState = {
    ...openDialog({ repo: Option.none(), branch: Option.some("feat/a"), repos: ["/r/app"] }),
    at: 3,
  };

  test("a repo: the dialog goes on in it, reads it, and offers no branch I'm on", () => {
    expect(pick(picking, Option.some({ _tag: "Repo", root: "/r/web" }))).toEqual({
      _tag: "ReadRepo",
      root: "/r/web",
      state: {
        ...picking,
        repo: Option.some("/r/web"),
        current: Option.none(),
        reading: true,
        at: 0,
      },
    });
  });

  test("a choice in the repo: the panel switches to or creates it, from the base chosen", () => {
    const inRepo: DialogState = {
      ...openDialog({ repo: Option.some("/r/app"), branch: Option.some("feat/a"), repos: [] }),
      base: "current",
    };
    const typed: Choice = { _tag: "Typed", name: "new", shortcut: false };
    expect(pick(inRepo, Option.some(typed))).toEqual({
      _tag: "Send",
      action: {
        _tag: "Create",
        machine: THIS_MACHINE,
        main: "/r/app",
        name: "new",
        base: "feat/a",
      },
    });
  });

  test("no line (an empty list), or a choice with no repo yet, takes nothing", () => {
    const typed: Choice = { _tag: "Typed", name: "new", shortcut: false };
    expect([pick(picking, Option.none()), pick(picking, Option.some(typed))]).toEqual([
      { _tag: "Nothing" },
      { _tag: "Nothing" },
    ]);
  });
});
