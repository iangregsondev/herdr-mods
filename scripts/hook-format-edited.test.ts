import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { fakeBin, linkTools, runSh, tempDir, writeFile } from "./test-support.ts";

const hook = join(import.meta.dirname, "..", ".claude", "hooks", "format-edited.sh");

interface Setup {
  project: string;
  log: string;
  run: (stdin: string) => ReturnType<typeof runSh>;
}

/**
 * A project folder and a PATH of only `tools` plus a fake `vp` that logs its args and
 * exits with `vpExit`.
 */
function setup(tools: readonly string[], vpExit = 0): Setup {
  const root = tempDir();
  const project = join(root, "project");
  const bin = join(root, "bin");
  const log = join(root, "vp.log");
  linkTools(bin, tools);
  fakeBin(bin, "vp", `echo "$*" >> "${log}"\necho "vp chatter"\nexit ${vpExit}`);
  writeFile(project, "src/a.ts", "export const a = 1;\n");
  return {
    project,
    log,
    run: (stdin) => runSh(hook, { stdin, env: { PATH: bin, CLAUDE_PROJECT_DIR: project } }),
  };
}

const input = (filePath?: string): string =>
  JSON.stringify({ tool_input: filePath === undefined ? {} : { file_path: filePath } });

const vpCalls = (log: string): string[] =>
  existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];

describe("format-edited.sh", () => {
  test("formats a file inside the project with vp fmt", () => {
    const { project, log, run } = setup(["sh", "jq"]);
    const file = join(project, "src/a.ts");
    const result = run(input(file));
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual([`fmt --no-error-on-unmatched-pattern ${file}`]);
    expect(result.stdout).not.toContain("vp chatter");
  });

  test("leaves a file outside the project alone", () => {
    const { log, run } = setup(["sh", "jq"]);
    const result = run(input("/elsewhere/b.ts"));
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual([]);
  });

  test("leaves a file in a sibling folder that shares the project's name prefix alone", () => {
    const { project, log, run } = setup(["sh", "jq"]);
    const result = run(input(`${project}-other/b.ts`));
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual([]);
  });

  test("does nothing when the input has no file path", () => {
    const { log, run } = setup(["sh", "jq"]);
    const result = run(input());
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toEqual([]);
  });

  test("says why on stderr and exits 0 when jq is missing", () => {
    const { project, log, run } = setup(["sh"]);
    const result = run(input(join(project, "src/a.ts")));
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("jq not found");
    expect(vpCalls(log)).toEqual([]);
  });

  test("exits 0 even when vp fmt fails", () => {
    const { project, log, run } = setup(["sh", "jq"], 1);
    const result = run(input(join(project, "src/a.ts")));
    expect(result.code).toBe(0);
    expect(vpCalls(log)).toHaveLength(1);
  });
});
