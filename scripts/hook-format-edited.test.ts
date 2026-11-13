import { join, relative } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  type ShResult,
  type VpPlace,
  fakeLoggingBin,
  loggedLines,
  runSh,
  tempDir,
  toolPath,
  vpEnv,
  vpFolder,
  writeFile,
} from "./test-support.ts";

const repoRoot = join(import.meta.dirname, "..");
const hook = join(repoRoot, ".claude", "hooks", "format-edited.sh");

interface Setup {
  project: string;
  /** The log of the fake `vp`, wherever it sits. */
  log: string;
  run: (stdin: string) => ShResult;
}

/**
 * A project folder and a PATH of only `tools`. A fake `vp` that logs its args, prints some
 * chatter and exits with `vpExit` sits in `vpIn` (default: on PATH; none when null). HOME,
 * VP_HOME and XDG_DATA_HOME all point under the temp folder (`vpEnv`), so the machine's
 * real vp is never found. With `relative`, the hook runs by a path relative to the repo root.
 */
function setup(
  tools: readonly string[],
  options: { vpExit?: number; vpIn?: VpPlace | null; relative?: boolean } = {},
): Setup {
  const root = tempDir();
  const project = join(root, "project");
  const bin = toolPath(root, tools);
  const log = join(root, "vp.log");
  const vpIn = options.vpIn === undefined ? "path" : options.vpIn;
  if (vpIn !== null) {
    fakeLoggingBin(vpFolder(root, vpIn), "vp", {
      log,
      output: "vp chatter\n",
      exit: options.vpExit ?? 0,
    });
  }
  writeFile(project, "src/a.ts", "export const a = 1;\n");
  return {
    project,
    log,
    run: (stdin) =>
      runSh(options.relative === true ? relative(repoRoot, hook) : hook, {
        cwd: repoRoot,
        stdin,
        env: {
          PATH: bin,
          ...vpEnv(root),
          CLAUDE_PROJECT_DIR: project,
        },
      }),
  };
}

const input = (filePath?: string): string =>
  JSON.stringify({ tool_input: filePath === undefined ? {} : { file_path: filePath } });

describe("format-edited.sh", () => {
  test("formats a file inside the project with vp fmt", () => {
    const { project, log, run } = setup(["sh", "jq"]);
    const file = join(project, "src/a.ts");
    const result = run(input(file));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([`fmt --no-error-on-unmatched-pattern ${file}`]);
    expect(result.stdout).not.toContain("vp chatter");
  });

  test("leaves a file outside the project alone", () => {
    const { log, run } = setup(["sh", "jq"]);
    const result = run(input("/elsewhere/b.ts"));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("leaves a file in a sibling folder that shares the project's name prefix alone", () => {
    const { project, log, run } = setup(["sh", "jq"]);
    const result = run(input(`${project}-other/b.ts`));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("does nothing when the input has no file path", () => {
    const { log, run } = setup(["sh", "jq"]);
    const result = run(input());
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([]);
  });

  test("says jq is missing on stderr and exits 1 without running vp when jq is missing", () => {
    const { project, log, run } = setup(["sh"]);
    const result = run(input(join(project, "src/a.ts")));
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "format-edited.sh: jq not found (looked on PATH), so the edited file was not formatted.\n",
    );
    expect(loggedLines(log)).toEqual([]);
  });

  test("finds and runs vp in $VP_HOME/bin when it is not on PATH", () => {
    const { project, log, run } = setup(["sh", "jq"], { vpIn: "vpHome" });
    const file = join(project, "src/a.ts");
    const result = run(input(file));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([`fmt --no-error-on-unmatched-pattern ${file}`]);
  });

  test("finds and runs vp in $HOME/.vite-plus/bin when it is not on PATH", () => {
    const { project, log, run } = setup(["sh", "jq"], { vpIn: "home" });
    const file = join(project, "src/a.ts");
    const result = run(input(file));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([`fmt --no-error-on-unmatched-pattern ${file}`]);
  });

  test("finds and runs vp in $XDG_DATA_HOME/vite-plus/bin when it is not on PATH", () => {
    const { project, log, run } = setup(["sh", "jq"], { vpIn: "xdg" });
    const file = join(project, "src/a.ts");
    const result = run(input(file));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([`fmt --no-error-on-unmatched-pattern ${file}`]);
  });

  test("finds vp in a Vite+ bin folder when run by a relative path", () => {
    const { project, log, run } = setup(["sh", "jq"], { vpIn: "home", relative: true });
    const file = join(project, "src/a.ts");
    const result = run(input(file));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toEqual([`fmt --no-error-on-unmatched-pattern ${file}`]);
  });

  test("says vp is missing on stderr and exits 1 when no vp is found", () => {
    const { project, run } = setup(["sh", "jq"], { vpIn: null });
    const result = run(input(join(project, "src/a.ts")));
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "format-edited.sh: vp not found (looked on PATH and in the Vite+ bin folders), so the edited file was not formatted.\n",
    );
  });

  test("exits 0 even when vp fmt fails", () => {
    const { project, log, run } = setup(["sh", "jq"], { vpExit: 1 });
    const result = run(input(join(project, "src/a.ts")));
    expect(result.code).toBe(0);
    expect(loggedLines(log)).toHaveLength(1);
  });
});
