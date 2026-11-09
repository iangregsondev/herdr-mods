// Helpers for tests of root scripts and hooks: temp folders, fake commands, and running a
// shell script. Tests never touch the real Herdr home or the repo's own files.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vite-plus/test";

/** A new empty folder, removed when the current test finishes. Call it inside a test. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "herdr-mods-test-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Writes `content` to `dir/relPath`, making parent folders. Returns the full path. */
export function writeFile(dir: string, relPath: string, content: string): string {
  const path = join(dir, relPath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** Writes an executable `sh` script named `name` into `binDir`, for use on PATH. */
export function fakeBin(binDir: string, name: string, body: string): string {
  const path = writeFile(binDir, name, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/**
 * Links the named system commands into `binDir`, so a PATH of only `binDir` has exactly
 * those tools (and can leave one out, such as jq). A tool not on the real PATH is skipped.
 */
export function linkTools(binDir: string, tools: readonly string[]): void {
  mkdirSync(binDir, { recursive: true });
  for (const tool of tools) {
    const found = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" });
    const path = found.stdout.trim();
    if (found.status === 0 && path.startsWith("/")) symlinkSync(path, join(binDir, tool));
  }
}

export interface ShResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ShOptions {
  args?: readonly string[];
  /** Merged over this process's environment; a key set to undefined is removed. */
  env?: Record<string, string | undefined>;
  stdin?: string;
  cwd?: string;
}

/** Runs `sh <script> [args]` and returns its exit code and output. */
export function runSh(script: string, options: ShOptions = {}): ShResult {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...options.env }).filter(([, value]) => value !== undefined),
  );
  const result = spawnSync("sh", [script, ...(options.args ?? [])], {
    env,
    input: options.stdin ?? "",
    cwd: options.cwd,
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs git in `cwd` with a fixed identity, returning stdout. */
export function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}
