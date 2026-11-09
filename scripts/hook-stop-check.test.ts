import { join } from "node:path";
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

const hook = join(import.meta.dirname, "..", ".claude", "hooks", "stop-check.sh");

const tools = ["sh", "jq", "git", "wc", "head", "tail"] as const;

interface Setup {
  project: string;
  log: string;
  run: (stdin?: string) => ShResult;
}

/**
 * A git repo with one commit and `origin/main` at HEAD, and a PATH of only `pathTools`
 * plus a fake `vp` that logs its args, prints `vpOutput` and exits with `vpExit`. The
 * hook runs with git cut off from the host's config.
 */
function setup(
  options: { vpOutput?: string; vpExit?: number; pathTools?: readonly string[] } = {},
): Setup {
  const root = tempDir();
  const project = join(root, "project");
  const bin = toolPath(root, options.pathTools ?? tools);
  const log = join(root, "vp.log");
  fakeLoggingBin(bin, "vp", { log, output: options.vpOutput, exit: options.vpExit });
  writeFile(project, "a.txt", "one\n");
  git(project, ["init", "-q", "-b", "work"]);
  git(project, ["add", "."]);
  git(project, ["commit", "-q", "-m", "first"]);
  git(project, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return {
    project,
    log,
    run: (stdin = JSON.stringify({ stop_hook_active: false })) =>
      runSh(hook, {
        stdin,
        env: { ...isolatedGitEnv(), PATH: bin, CLAUDE_PROJECT_DIR: project },
      }),
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

  test("exits 0 without checks when the project folder is missing", () => {
    const root = tempDir();
    const bin = toolPath(root, tools);
    const log = join(root, "vp.log");
    fakeLoggingBin(bin, "vp", { log, exit: 1 });
    const result = runSh(hook, {
      stdin: JSON.stringify({ stop_hook_active: false }),
      env: { ...isolatedGitEnv(), PATH: bin, CLAUDE_PROJECT_DIR: join(root, "missing") },
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

  test("says why on stderr and exits 0 without checks when jq is missing", () => {
    const { project, log, run } = setup({
      vpExit: 1,
      pathTools: tools.filter((tool) => tool !== "jq"),
    });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("jq not found");
    expect(loggedLines(log)).toEqual([]);
  });
});
