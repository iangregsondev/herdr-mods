import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, onTestFinished, test, vi } from "vite-plus/test";
import {
  fakeLoggingBin,
  git,
  isolatedGitEnv,
  linkTools,
  loggedLines,
  readLayout,
  runSh,
  slot,
  tempDir,
  toolPath,
  writeFile,
} from "./test-support.ts";

/** Sets an env var for the current test only. */
const stubEnv = (name: string, value: string): void => {
  vi.stubEnv(name, value);
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
};

describe("git", () => {
  test("commits despite a global config that demands a signer that fails", () => {
    const root = tempDir();
    const config = writeFile(
      root,
      "gitconfig",
      "[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = false\n",
    );
    stubEnv("GIT_CONFIG_GLOBAL", config);
    const project = join(root, "project");
    writeFile(project, "a.txt", "one\n");
    git(project, ["init", "-q", "-b", "work"]);
    git(project, ["add", "."]);
    git(project, ["commit", "-q", "-m", "first"]);
    expect(git(project, ["log", "--format=%s"])).toBe("first\n");
  });

  test("works in its own folder even when GIT_DIR points elsewhere", () => {
    const root = tempDir();
    stubEnv("GIT_DIR", join(root, "other.git"));
    const project = join(root, "project");
    writeFile(project, "a.txt", "one\n");
    git(project, ["init", "-q"]);
    expect(existsSync(join(project, ".git"))).toBe(true);
    expect(existsSync(join(root, "other.git"))).toBe(false);
  });

  test("returns git's stdout", () => {
    const project = tempDir();
    git(project, ["init", "-q", "-b", "work"]);
    expect(git(project, ["branch", "--show-current"])).toBe("work\n");
  });
});

describe("isolatedGitEnv", () => {
  test("ignores the host's git config and removes inherited repo pointers", () => {
    const env = isolatedGitEnv();
    expect(env.GIT_CONFIG_GLOBAL).toBe("/dev/null");
    expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
    [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_COMMON_DIR",
    ].forEach((name) => {
      expect(env).toHaveProperty(name, undefined);
    });
  });
});

describe("linkTools", () => {
  test("links a tool found on PATH", () => {
    const bin = join(tempDir(), "bin");
    linkTools(bin, ["sh"]);
    expect(existsSync(join(bin, "sh"))).toBe(true);
  });

  test("throws naming a tool that isn't on PATH", () => {
    const bin = join(tempDir(), "bin");
    expect(() => linkTools(bin, ["no-such-tool-xyz"])).toThrow(/no-such-tool-xyz/);
  });

  test("treats a tool name as a name, never as shell code", () => {
    const root = tempDir();
    const marker = join(root, "ran");
    expect(() => linkTools(join(root, "bin"), [`sh; touch ${marker}`])).toThrow();
    expect(existsSync(marker)).toBe(false);
  });
});

describe("runSh", () => {
  test("returns the exit code and output", () => {
    const script = writeFile(tempDir(), "s.sh", "echo out\necho err >&2\nexit 3\n");
    expect(runSh(script)).toEqual({ code: 3, stdout: "out\n", stderr: "err\n" });
  });

  test("returns the exit when the script leaves its stdin unread", () => {
    // Far more than a pipe holds, so the write always meets a closed pipe.
    const script = writeFile(tempDir(), "s.sh", "echo early\nexit 0\n");
    expect(runSh(script, { stdin: "x".repeat(1_000_000) })).toEqual({
      code: 0,
      stdout: "early\n",
      stderr: "",
    });
  });

  test("throws with the cause when the script can't be started", () => {
    const script = writeFile(tempDir(), "s.sh", "exit 0\n");
    expect(() => runSh(script, { cwd: join(tempDir(), "missing") })).toThrow(/ENOENT/);
  });

  test("throws naming the signal when the script is killed", () => {
    const script = writeFile(tempDir(), "s.sh", "kill -TERM $$\n");
    expect(() => runSh(script)).toThrow(/SIGTERM/);
  });
});

describe("fakeLoggingBin and loggedLines", () => {
  test("logs each call's args, prints the output and exits with the code", () => {
    const root = tempDir();
    const bin = toolPath(root, ["sh"]);
    const log = join(root, "vp.log");
    fakeLoggingBin(bin, "vp", { log, output: "it's done\n", exit: 4 });
    const script = writeFile(root, "s.sh", "vp fmt a.ts\nvp check 'b c'\n");
    const result = runSh(script, { env: { PATH: bin } });
    expect(result).toEqual({ code: 4, stdout: "it's done\nit's done\n", stderr: "" });
    expect(loggedLines(log)).toEqual(["fmt a.ts", "check b c"]);
  });

  test("prints nothing and exits 0 by default", () => {
    const root = tempDir();
    const bin = toolPath(root, ["sh"]);
    const log = join(root, "vp.log");
    fakeLoggingBin(bin, "vp", { log });
    const script = writeFile(root, "s.sh", "vp\n");
    expect(runSh(script, { env: { PATH: bin } })).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(loggedLines(log)).toEqual([""]);
  });

  test("loggedLines is empty when nothing was logged", () => {
    expect(loggedLines(join(tempDir(), "vp.log"))).toEqual([]);
  });
});

describe("toolPath", () => {
  test("returns a bin folder in root holding the tools", () => {
    const root = tempDir();
    const bin = toolPath(root, ["sh"]);
    expect(bin).toBe(join(root, "bin"));
    expect(existsSync(join(bin, "sh"))).toBe(true);
  });
});

describe("slot and readLayout", () => {
  test("readLayout reads back a layout holding slots", () => {
    const layout = { id: "root", type: "row", children: [slot("hello")] };
    const path = writeFile(tempDir(), "layouts/a.json", JSON.stringify(layout));
    expect(readLayout(path)).toEqual({
      id: "root",
      type: "row",
      children: [{ id: "b-hello", type: "block", content: { mod: "hello" } }],
    });
  });
});

describe("writeFile", () => {
  test("makes parent folders and returns the full path", () => {
    const dir = tempDir();
    const path = writeFile(dir, "a/b/c.txt", "x");
    expect(path).toBe(join(dir, "a/b/c.txt"));
    expect(existsSync(path)).toBe(true);
  });
});
