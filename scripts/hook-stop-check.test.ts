import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { fakeBin, git, linkTools, runSh, tempDir, writeFile } from "./test-support.ts";

const hook = join(import.meta.dirname, "..", ".claude", "hooks", "stop-check.sh");

const tools = ["sh", "jq", "git", "wc", "head", "tail"] as const;

interface Setup {
  project: string;
  log: string;
  run: (stdin?: string) => ReturnType<typeof runSh>;
}

/**
 * A git repo with one commit and `origin/main` at HEAD, and a PATH of only `pathTools`
 * plus a fake `vp` that logs its args, prints `vpOutput` and exits with `vpExit`.
 */
function setup(
  options: { vpOutput?: string; vpExit?: number; pathTools?: readonly string[] } = {},
): Setup {
  const root = tempDir();
  const project = join(root, "project");
  const bin = join(root, "bin");
  const log = join(root, "vp.log");
  const outputFile = writeFile(root, "vp-output.txt", options.vpOutput ?? "");
  linkTools(bin, options.pathTools ?? tools);
  fakeBin(bin, "vp", `echo "$*" >> "${log}"\ncat "${outputFile}"\nexit ${options.vpExit ?? 0}`);
  linkTools(bin, ["cat"]);
  writeFile(project, "a.txt", "one\n");
  git(project, ["init", "-q", "-b", "work"]);
  git(project, ["add", "."]);
  git(project, ["commit", "-q", "-m", "first"]);
  git(project, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return {
    project,
    log,
    run: (stdin = JSON.stringify({ stop_hook_active: false })) =>
      runSh(hook, { stdin, env: { PATH: bin, CLAUDE_PROJECT_DIR: project } }),
  };
}

const vpCalls = (log: string): string[] =>
  existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];

const numbered = (count: number): string =>
  Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n");

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
    expect(vpCalls(log)).toEqual([]);
  });

  test("lets the stop through without checks on a clean tree at origin/main", () => {
    const { log, run } = setup({ vpExit: 1 });
    const result = run();
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual([]);
  });

  test("runs vp run verify when the tree has changes", () => {
    const { project, log, run } = setup();
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual(["run verify"]);
  });

  test("runs vp run verify when there is no origin/main", () => {
    const { project, log, run } = setup();
    git(project, ["update-ref", "-d", "refs/remotes/origin/main"]);
    const result = run();
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual(["run verify"]);
  });

  test("runs vp run verify on a clean tree with commits ahead of origin/main", () => {
    const { project, log, run } = setup();
    writeFile(project, "b.txt", "two\n");
    git(project, ["add", "."]);
    git(project, ["commit", "-q", "-m", "second"]);
    const result = run();
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual(["run verify"]);
  });

  test("blocks the stop with exit 2 and the output on stderr when verify fails", () => {
    const { project, run } = setup({ vpOutput: "test x failed\nexpected 1", vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(2);
    expect(shownOutput(result.stderr)).toEqual(["test x failed", "expected 1"]);
  });

  test("shows exactly 60 lines of failing output in full", () => {
    const { project, run } = setup({ vpOutput: numbered(60), vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(2);
    expect(shownOutput(result.stderr)).toEqual(numbered(60).split("\n"));
  });

  test("cuts failing output over 60 lines to the first 20 and the last 40", () => {
    const { project, run } = setup({ vpOutput: numbered(75), vpExit: 1 });
    writeFile(project, "a.txt", "changed\n");
    const result = run();
    expect(result.code).toBe(2);
    const all = numbered(75).split("\n");
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
    expect(vpCalls(log)).toEqual([]);
  });
});
