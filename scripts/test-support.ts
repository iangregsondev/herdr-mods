// Helpers for tests of root scripts and hooks: temp folders, fake commands, and running a
// shell script. Tests never write to the real Herdr home or the repo.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished, vi } from "vite-plus/test";
import type { LayoutNode } from "./herdr-slots.ts";

/** A new empty folder, removed when the current test finishes. Call it inside a test. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "herdr-mods-test-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Writes `content` to `dir/relPath`, making parent folders. Returns the full path. */
export function writeFile(dir: string, relPath: string, content: string): string {
  const path = join(dir, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** Writes an executable `sh` script named `name` into `binDir`, for use on PATH. */
export function fakeBin(binDir: string, name: string, body: string): void {
  chmodSync(writeFile(binDir, name, `#!/bin/sh\n${body}\n`), 0o755);
}

/** `value` as one single-quoted `sh` word, so the shell reads it literally. */
const shQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * Writes a fake command `name` into `binDir` that appends its args, space-joined, as one
 * line to `log`, prints `output` (default nothing) and exits with `exit` (default 0).
 * Read the calls back with `loggedLines(log)`.
 */
export function fakeLoggingBin(
  binDir: string,
  name: string,
  options: { log: string; output?: string; exit?: number },
): void {
  fakeBin(
    binDir,
    name,
    [
      `printf '%s\\n' "$*" >> ${shQuote(options.log)}`,
      `printf '%s' ${shQuote(options.output ?? "")}`,
      `exit ${options.exit ?? 0}`,
    ].join("\n"),
  );
}

/** The lines a `fakeLoggingBin` wrote to `log`, one per call; empty if it never ran. */
export function loggedLines(log: string): string[] {
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
}

/**
 * Links the named system commands into `binDir`, so a PATH of only `binDir` has exactly
 * those tools (and can leave one out, such as jq). Throws naming any tool not on the real
 * PATH, so a test never runs without a tool it asked for.
 */
export function linkTools(binDir: string, tools: readonly string[]): void {
  mkdirSync(binDir, { recursive: true });
  tools.forEach((tool) => {
    // The name is passed as "$1", so the shell never reads it as code.
    const found = spawnSync("sh", ["-c", 'command -v "$1"', "sh", tool], { encoding: "utf8" });
    const path = found.stdout.trim();
    if (found.status !== 0 || !path.startsWith("/")) {
      throw new Error(`linkTools: ${tool} is not on PATH`);
    }
    symlinkSync(path, join(binDir, tool));
  });
}

/** Links `tools` into `<root>/bin` (see `linkTools`) and returns that folder, for PATH. */
export function toolPath(root: string, tools: readonly string[]): string {
  const bin = join(root, "bin");
  linkTools(bin, tools);
  return bin;
}

export interface ShResult {
  code: number;
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

/** `process.env` with `overrides` merged over it; a key set to undefined is removed. */
const mergedEnv = (overrides: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ ...process.env, ...overrides }).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value]],
    ),
  );

/**
 * Runs `sh <script> [args]` and returns its exit code and output. Throws, naming the
 * script and the cause, when it can't be started, is killed by a signal, or runs past
 * 10 seconds.
 */
export function runSh(script: string, options: ShOptions = {}): ShResult {
  const result = spawnSync("sh", [script, ...(options.args ?? [])], {
    env: mergedEnv(options.env ?? {}),
    input: options.stdin ?? "",
    cwd: options.cwd,
    encoding: "utf8",
    timeout: 10_000,
  });
  // EPIPE means the script exited before reading all its stdin, as one that stops early
  // does. It still ran and exited, so its exit code and output stand.
  const { error } = result;
  const unreadStdin =
    error !== undefined && "code" in error && error.code === "EPIPE" && result.status !== null;
  if (error !== undefined && !unreadStdin) {
    throw new Error(`runSh ${script}: ${error.message}`, { cause: error });
  }
  if (result.status === null) {
    throw new Error(`runSh ${script}: killed by ${result.signal ?? "a signal"}`);
  }
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Env overrides that cut git off from the host: no global or system config (so no
 * signing, hooks path or templates), and no inherited pointers to another repo. Merge it
 * over `process.env`, as `runSh`'s `env` does; a key set to undefined is removed.
 */
export function isolatedGitEnv(): Record<string, string | undefined> {
  return {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_PARAMETERS: undefined,
    GIT_CONFIG_COUNT: undefined,
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
    GIT_OBJECT_DIRECTORY: undefined,
    GIT_COMMON_DIR: undefined,
  };
}

/** Runs git in `cwd` with a fixed identity and `isolatedGitEnv`, and returns its stdout. */
export function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: mergedEnv({
      ...isolatedGitEnv(),
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    }),
  });
}

/** A fake Herdr host for the Remote layer: see `fakeHerdrHost`. */
export interface FakeHerdrHost {
  /** The host's file system root; the remote shell's HOME, so `~/…` lands here. */
  readonly root: string;
  /** The Herdr home on the host: `<root>/.config/herdr-app`. */
  readonly home: string;
  /** Where the host's `herdr-app` goes: `<root>/.local/bin`. Add one with `fakeBin`. */
  readonly appBin: string;
  /** The dev target that reaches this host, with defaults for Herdr home and app path. */
  readonly target: {
    readonly host: string;
    readonly user: string;
    readonly port: number;
    readonly herdrHome: string;
    readonly herdrApp: string;
    readonly file: string;
  };
  /** One line per `ssh` call: its arguments, space-joined. Read with `loggedLines`. */
  readonly sshLog: string;
  /** One line per `rsync` call: its arguments, space-joined. Read with `loggedLines`. */
  readonly rsyncLog: string;
}

/**
 * A temp folder acting as a Herdr host reached over SSH, with fake `ssh` and `rsync`
 * put first on PATH for the current test. Fake `ssh` logs its arguments, skips its
 * options and the host name, and runs the rest with `sh -c` in `root` (HOME=root,
 * TMPDIR=root/tmp), reading its stdin. Fake `rsync` logs its arguments and copies the
 * last two (source, destination) locally, dropping `user@host:` and reading a relative
 * remote path from `root`; a source ending in `/` copies the folder's contents. With
 * `unreachable`, both print an SSH connection error and exit 255, as they do when the
 * host can't be reached. Call it inside a test.
 */
export function fakeHerdrHost(options: { readonly unreachable?: boolean } = {}): FakeHerdrHost {
  const dir = tempDir();
  const root = join(dir, "host");
  const bin = join(dir, "bin");
  const sshLog = join(dir, "ssh.log");
  const rsyncLog = join(dir, "rsync.log");
  mkdirSync(join(root, "tmp"), { recursive: true });
  const unreachable = options.unreachable
    ? "echo 'ssh: connect to host herdr-host port 2222: Connection refused' >&2\nexit 255"
    : "";
  fakeBin(
    bin,
    "ssh",
    [
      `printf '%s\\n' "$*" >> ${shQuote(sshLog)}`,
      unreachable,
      // Skip the options (and the values of those that take one), then the host name.
      'while [ $# -gt 0 ]; do case "$1" in -p|-o|-l) shift 2 ;; -*) shift ;; *) break ;; esac; done',
      "shift",
      `cd ${shQuote(root)} && HOME=${shQuote(root)} TMPDIR=${shQuote(join(root, "tmp"))} exec sh -c "$*"`,
    ].join("\n"),
  );
  fakeBin(
    bin,
    "rsync",
    [
      `printf '%s\\n' "$*" >> ${shQuote(rsyncLog)}`,
      unreachable,
      // A remote path (user@host:path) without the prefix; a relative one is under root.
      'local_path() { case "$1" in *@*:*) p=${1#*:}; case "$p" in /*) printf \'%s\' "$p" ;;' +
        ` *) printf '%s/%s' ${shQuote(root)} "$p" ;; esac ;; *) printf '%s' "$1" ;; esac; }`,
      "for arg; do src=$dest; dest=$arg; done",
      'src=$(local_path "$src"); dest=$(local_path "$dest")',
      'case "$src" in */) mkdir -p "$dest" && cp -R "$src". "$dest" ;; *) cp "$src" "$dest" ;; esac',
    ].join("\n"),
  );
  vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  return {
    root,
    home: join(root, ".config/herdr-app"),
    appBin: join(root, ".local/bin"),
    target: {
      host: "herdr-host",
      user: "ann",
      port: 2222,
      herdrHome: "~/.config/herdr-app",
      herdrApp: "~/.local/bin/herdr-app",
      file: "herdr-dev.json",
    },
    sshLog,
    rsyncLog,
  };
}

/** A layout block holding `mod`, with id `b-<mod>`. */
export function slot(mod: string): LayoutNode {
  return { id: `b-${mod}`, type: "block", content: { mod } };
}

/** Reads a layout file. */
export function readLayout(path: string): LayoutNode {
  // Tests read only layouts they or the code under test wrote as a LayoutNode; the
  // assertions check the shape.
  return JSON.parse(readFileSync(path, "utf8")) as LayoutNode;
}
