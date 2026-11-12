import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { runSh, tempDir, toolPath, writeFile } from "./test-support.ts";

const script = join(import.meta.dirname, "copy-dev-config.sh");

/** A main checkout and a new worktree, both empty folders, and a PATH of only `sh` and `cp`. */
const checkouts = (): { main: string; worktree: string; path: string } => {
  const root = tempDir();
  const main = join(root, "main");
  const worktree = join(root, "worktree");
  mkdirSync(main);
  mkdirSync(worktree);
  return { main, worktree, path: toolPath(root, ["sh", "cp"]) };
};

/** The text of `dir/herdr-dev.json`, or undefined when there is none. */
const devConfig = (dir: string): string | undefined => {
  const file = join(dir, "herdr-dev.json");
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
};

describe("copy-dev-config.sh", () => {
  test("copies herdr-dev.json from the main checkout into the new worktree", () => {
    const { main, worktree, path } = checkouts();
    writeFile(main, "herdr-dev.json", '{"target":"remote"}\n');

    const result = runSh(script, { args: [main, worktree], env: { PATH: path } });

    expect(result.code).toBe(0);
    expect(devConfig(worktree)).toBe('{"target":"remote"}\n');
  });

  test("copies nothing and succeeds when the main checkout has no herdr-dev.json", () => {
    const { main, worktree, path } = checkouts();

    const result = runSh(script, { args: [main, worktree], env: { PATH: path } });

    expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" });
    expect(devConfig(worktree)).toBeUndefined();
  });

  test("keeps a herdr-dev.json the worktree already has", () => {
    const { main, worktree, path } = checkouts();
    writeFile(main, "herdr-dev.json", '{"target":"remote"}\n');
    writeFile(worktree, "herdr-dev.json", '{"target":"local"}\n');

    const result = runSh(script, { args: [main, worktree], env: { PATH: path } });

    expect(result.code).toBe(0);
    expect(devConfig(worktree)).toBe('{"target":"local"}\n');
  });
});
