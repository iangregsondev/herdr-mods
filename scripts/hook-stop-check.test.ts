import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  type ShResult,
  fakeLoggingBin,
  git,
  isolatedGitEnv,
  loggedLines,
  runSh,
  tempDir,
  toolPath,
  writeFile,
} from "./test-support.ts";

const repoRoot = join(import.meta.dirname, "..");
const hook = join(repoRoot, ".claude", "hooks", "stop-check.sh");

const tools = ["sh", "jq", "git", "wc", "head", "tail"] as const;

/** Where a fake `vp` can sit: on PATH, or in one of the Vite+ bin folders. */
type VpPlace = "path" | "vpHome" | "home" | "xdg" | "xdgDefault";

interface Env {
  /** Whether VP_HOME is set (to `<root>/vp-home`); default true. */
  vpHomeSet?: boolean;
  /** Whether XDG_DATA_HOME is set (to `<root>/xdg`); default true. */
  xdgSet?: boolean;
}

/** The folder for `place` under `root`, given the env `hookEnv` builds. */
const vpFolder = (root: string, place: VpPlace): string =>
  ({
    path: join(root, "bin"),
    vpHome: join(root, "vp-home", "bin"),
    home: join(root, "home", ".vite-plus", "bin"),
    xdg: join(root, "xdg", "vite-plus", "bin"),
    xdgDefault: join(root, "home", ".local", "share", "vite-plus", "bin"),
  })[place];

/**
 * The hook's env: git cut off from the host, PATH of only `<root>/bin`, and HOME,
 * VP_HOME and XDG_DATA_HOME all under `root`, so the machine's real vp is never found.
 */
const hookEnv = (root: string, project: string, env: Env = {}) => ({
  ...isolatedGitEnv(),
  PATH: join(root, "bin"),
  HOME: join(root, "home"),
  VP_HOME: (env.vpHomeSet ?? true) ? join(root, "vp-home") : undefined,
  XDG_DATA_HOME: (env.xdgSet ?? true) ? join(root, "xdg") : undefined,
  CLAUDE_PROJECT_DIR: project,
});

interface Setup {
  project: string;
  /** The log of the fake `vp` in the first place of `vpIn`. */
  log: string;
  /** The log of the fake `vp` in `place`. */
  logOf: (place: VpPlace) => string;
  run: (stdin?: string) => ShResult;
}

/**
 * A git repo with one commit and `origin/main` at HEAD, and a PATH of only `pathTools`.
 * A fake `vp` that logs its args, prints `vpOutput` and exits with `vpExit` sits in each
 * place of `vpIn` (default: on PATH), each with its own log. The hook runs with git cut
 * off from the host's config.
 */
function setup(
  options: {
    vpOutput?: string;
    vpExit?: number;
    pathTools?: readonly string[];
    vpIn?: readonly VpPlace[];
  } & Env = {},
): Setup {
  const root = tempDir();
  const project = join(root, "project");
  toolPath(root, options.pathTools ?? tools);
  const vpIn = options.vpIn ?? ["path"];
  const logOf = (place: VpPlace): string => join(root, `vp-${place}.log`);
  vpIn.forEach((place) =>
    fakeLoggingBin(vpFolder(root, place), "vp", {
      log: logOf(place),
      output: options.vpOutput,
      exit: options.vpExit,
    }),
  );
  writeFile(project, "a.txt", "one\n");
  git(project, ["init", "-q", "-b", "work"]);
  git(project, ["add", "."]);
  git(project, ["commit", "-q", "-m", "first"]);
  git(project, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return {
    project,
    log: logOf(vpIn[0] ?? "path"),
    logOf,
    run: (stdin = JSON.stringify({ stop_hook_active: false })) =>
      runSh(hook, { stdin, env: hookEnv(root, project, options) }),
  };
}

/** `count` lines, "line 1" to "line <count>". */
const numberedLines = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `line ${i + 1}`);

/** The stderr lines after the "Checks fail" line. */
const shownOutput = (stderr: string): string[] => {
  const lines = stderr.trimEnd().split("\n");
  expect(lines[0]).toMatch(/^Checks fail\./);
  return lines.slice(1);
};

/** Commits `file` with `content` on the current branch. */
const commitFile = (project: string, file: string, content: string, message: string): void => {
  writeFile(project, file, content);
  git(project, ["add", "."]);
  git(project, ["commit", "-q", "-m", message]);
};

/** Squash-merges the branch: a new commit on origin/main with the same tree as HEAD. */
const squashOntoMain = (project: string): void => {
  const squash = git(project, [
    "commit-tree",
    "HEAD^{tree}",
    "-p",
    "refs/remotes/origin/main",
    "-m",
    "squash",
  ]).trim();
  git(project, ["update-ref", "refs/remotes/origin/main", squash]);
};

/** Commits `file` with `content` on origin/main, leaving the branch checked out. */
const commitOnMain = (project: string, file: string, content: string, message: string): void => {
  git(project, ["checkout", "-q", "--detach", "refs/remotes/origin/main"]);
  commitFile(project, file, content, message);
  git(project, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(project, ["checkout", "-q", "work"]);
};

describe("stop-check.sh", () => {
  test("lets the stop through without checks when stop_hook_active is set", () => {
    const { project, log, run } = setup({ vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run(JSON.stringify({ stop_hook_active: true }));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("lets the stop through without checks on a clean tree at origin/main", () => {
    const { log, run } = setup({ vpExit: 1 });
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("runs vp run verify when the tree has changes", () => {
    const { project, log, run } = setup();
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("runs vp run verify when the input is not valid JSON", () => {
    const { project, log, run } = setup();
    writeFile(project, "a.txt", "changed\n");
    const result = run("not json");
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("runs vp run verify when there is no origin/main", () => {
    const { project, log, run } = setup();
    git(project, ["update-ref", "-d", "refs/remotes/origin/main"]);
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("runs vp run verify on a clean tree with commits ahead of origin/main", () => {
    const { project, log, run } = setup();
    writeFile(project, "b.txt", "two\n");
    git(project, ["add", "."]);
    git(project, ["commit", "-q", "-m", "second"]);
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("lets the stop through without checks on a squash-merged branch", () => {
    const { project, log, run } = setup({ vpExit: 1 });
    commitFile(project, "b.txt", "two\n", "second");
    squashOntoMain(project);
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("lets the stop through without checks on a squash-merged branch after main moves on", () => {
    const { project, log, run } = setup({ vpExit: 1 });
    commitFile(project, "b.txt", "two\n", "second");
    squashOntoMain(project);
    commitOnMain(project, "c.txt", "three\n", "unrelated");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("runs vp run verify on a squash-merged branch with a dirty tree", () => {
    const { project, log, run } = setup();
    commitFile(project, "b.txt", "two\n", "second");
    squashOntoMain(project);
    writeFile(project, "b.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("runs vp run verify when the branch conflicts with origin/main", () => {
    const { project, log, run } = setup();
    commitFile(project, "a.txt", "branch\n", "branch edit");
    commitOnMain(project, "a.txt", "main\n", "main edit");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("runs vp run verify when only the remote, not the local origin/main, holds the squash", () => {
    const { project, log, run } = setup();
    const remote = join(tempDir(), "remote.git");
    git(project, ["init", "-q", "--bare", remote]);
    git(project, ["remote", "add", "origin", remote]);
    const stale = git(project, ["rev-parse", "refs/remotes/origin/main"]).trim();
    commitFile(project, "b.txt", "two\n", "second");
    squashOntoMain(project);
    git(project, ["push", "-q", "origin", "refs/remotes/origin/main:refs/heads/main"]);
    git(project, ["update-ref", "refs/remotes/origin/main", stale]);
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("exits 0 without checks when the project folder is missing", () => {
    const root = tempDir();
    const bin = toolPath(root, tools);
    const log = join(root, "vp.log");
    fakeLoggingBin(bin, "vp", { log, exit: 1 });
    const result = runSh(hook, {
      stdin: JSON.stringify({ stop_hook_active: false }),
      env: hookEnv(root, join(root, "missing")),
    });
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("blocks the stop with exit 2 and the output on stderr when verify fails", () => {
    const { project, run } = setup({ vpOutput: "test x failed\nexpected 1", vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(2);
    expect(shownOutput(result.stderr)).toEqual(["test x failed", "expected 1"]);
  });

  test("shows exactly 60 lines of failing output in full", () => {
    const all = numberedLines(60);
    const { project, run } = setup({ vpOutput: all.join("\n"), vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(2);
    expect(shownOutput(result.stderr)).toEqual(all);
  });

  test("cuts 61 lines of failing output by one line", () => {
    const all = numberedLines(61);
    const { project, run } = setup({ vpOutput: all.join("\n"), vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(2);
    expect(shownOutput(result.stderr)).toEqual([
      ...all.slice(0, 20),
      "... (1 lines cut) ...",
      ...all.slice(21),
    ]);
  });

  test("cuts failing output over 60 lines to the first 20 and the last 40", () => {
    const all = numberedLines(75);
    const { project, run } = setup({ vpOutput: all.join("\n"), vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(2);
    expect(shownOutput(result.stderr)).toEqual([
      ...all.slice(0, 20),
      "... (15 lines cut) ...",
      ...all.slice(35),
    ]);
  });

  test("says jq is missing on stderr and exits 1 without checks when jq is missing", () => {
    const { project, log, run } = setup({
      vpExit: 1,
      pathTools: tools.filter((tool) => tool !== "jq"),
    });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "stop-check: jq not found (looked on PATH), so the checks were skipped.\n",
    );
    expect(loggedLines(log)).toEqual([]);
  });

  test("finds and runs vp in $VP_HOME/bin when it is not on PATH", () => {
    const { project, log, run } = setup({ vpIn: ["vpHome"] });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("finds and runs vp in $HOME/.vite-plus/bin when it is not on PATH", () => {
    const { project, log, run } = setup({ vpIn: ["home"] });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("finds and runs vp in $XDG_DATA_HOME/vite-plus/bin when it is not on PATH", () => {
    const { project, log, run } = setup({ vpIn: ["xdg"] });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("finds and runs vp in $HOME/.local/share/vite-plus/bin when XDG_DATA_HOME is unset", () => {
    const { project, log, run } = setup({ vpIn: ["xdgDefault"], xdgSet: false });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("runs the vp in the earlier folder when two Vite+ bin folders hold one", () => {
    const { project, logOf, run } = setup({ vpIn: ["vpHome", "home"] });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(logOf("vpHome"))).toEqual(["run verify"]);
    expect(loggedLines(logOf("home"))).toEqual([]);
  });

  test("skips the $VP_HOME/bin folder when VP_HOME is unset", () => {
    const { project, logOf, run } = setup({ vpIn: ["vpHome", "home"], vpHomeSet: false });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(logOf("vpHome"))).toEqual([]);
    expect(loggedLines(logOf("home"))).toEqual(["run verify"]);
  });

  test("passes over a folder named vp in an earlier Vite+ bin folder", () => {
    const { project, logOf, run } = setup({ vpIn: ["home"] });
    mkdirSync(join(vpFolder(dirname(project), "vpHome"), "vp"), { recursive: true });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(logOf("home"))).toEqual(["run verify"]);
  });

  test("runs the vp already on PATH over one in a Vite+ bin folder", () => {
    const { project, logOf, run } = setup({ vpIn: ["path", "vpHome"] });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(loggedLines(logOf("path"))).toEqual(["run verify"]);
    expect(loggedLines(logOf("vpHome"))).toEqual([]);
  });

  test("says vp is missing on stderr and exits 1 when no vp is found", () => {
    const { project, run } = setup({ vpIn: [] });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "stop-check: vp not found (looked on PATH and in the Vite+ bin folders), so the checks were skipped.\n",
    );
  });

  test("finds vp in a Vite+ bin folder when run by a relative path", () => {
    const root = tempDir();
    const project = join(root, "project");
    toolPath(root, tools);
    const log = join(root, "vp.log");
    fakeLoggingBin(vpFolder(root, "home"), "vp", { log });
    writeFile(project, "a.txt", "changed\n");
    git(project, ["init", "-q"]);
    const result = runSh(relative(repoRoot, hook), {
      cwd: repoRoot,
      stdin: JSON.stringify({ stop_hook_active: false }),
      env: hookEnv(root, project),
    });
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual(["run verify"]);
  });

  test("lets the stop through without vp when stop_hook_active is set", () => {
    const { project, run } = setup({ vpIn: [] });
    writeFile(project, "a.txt", "changed\n");
    const result = run(JSON.stringify({ stop_hook_active: true }));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("lets the stop through without vp on a clean tree at origin/main", () => {
    const { run } = setup({ vpIn: [] });
    const result = run();
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });
});
