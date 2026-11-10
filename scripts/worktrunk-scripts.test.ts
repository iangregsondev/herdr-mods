// The worktrunk panel's shell scripts (apps/worktrunk/src/commands.ts), run for real
// under `sh` against temp folders. They need Node to run, so they live here rather than
// in the mod's own tests.
import { mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { LIST_SCRIPT, OWNERS_SCRIPT, SCAN_SCRIPT, shArgs } from "../apps/worktrunk/src/commands.ts";
import { fakeBin, git, isolatedGitEnv, runSh, tempDir, writeFile } from "./test-support.ts";

/** `body` exactly as the panel runs it, as a file: `shArgs` puts the script second. */
const scriptFile = (body: string): string =>
  writeFile(tempDir(), "script.sh", shArgs(body, [])[1] ?? "");

describe("shArgs's script", () => {
  test("appends the folders wt and git are usually installed in to PATH", () => {
    const run = runSh(scriptFile('printf %s "$PATH"'), {
      env: { PATH: "/usr/bin:/bin", HOME: "/home/me" },
    });
    expect(run.stdout).toBe("/usr/bin:/bin:/home/me/.local/bin:/opt/homebrew/bin:/usr/local/bin");
  });
});

describe("SCAN_SCRIPT", () => {
  /** Makes each folder (with its parents) under `root`. */
  const folders = (root: string, paths: readonly string[]) =>
    paths.forEach((path) => mkdirSync(join(root, path), { recursive: true }));

  const scan = (depth: number, skip: string, tops: readonly string[]) =>
    runSh(scriptFile(SCAN_SCRIPT), { args: [String(depth), skip, ...tops] });

  test("a folder with a .git folder is a repo, printed with its group folder and a count", () => {
    const root = tempDir();
    folders(root, ["work/api/.git"]);
    expect(scan(4, "", [join(root, "work")]).stdout).toBe(
      `${join(root, "work")}\t${join(root, "work/api")}\t1\n`,
    );
  });

  test("counts the repo's linked worktrees, the main checkout included", () => {
    const root = tempDir();
    folders(root, ["work/api/.git/worktrees/feat", "work/api/.git/worktrees/fix"]);
    expect(scan(4, "", [join(root, "work")]).stdout).toBe(
      `${join(root, "work")}\t${join(root, "work/api")}\t3\n`,
    );
  });

  test("goes no deeper than the depth", () => {
    const root = tempDir();
    folders(root, ["work/a/b/near/.git", "work/a/b/c/far/.git"]);
    expect(scan(3, "", [join(root, "work")]).stdout).toBe(
      `${join(root, "work")}\t${join(root, "work/a/b/near")}\t1\n`,
    );
  });

  test("never enters a folder whose name is skipped", () => {
    const root = tempDir();
    folders(root, ["work/node_modules/dep/.git", "work/.cache/x/.git", "work/app/.git"]);
    expect(scan(4, "/node_modules//.cache/", [join(root, "work")]).stdout).toBe(
      `${join(root, "work")}\t${join(root, "work/app")}\t1\n`,
    );
  });

  test("never enters a symlinked folder", () => {
    const root = tempDir();
    folders(root, ["elsewhere/lib/.git", "work"]);
    symlinkSync(join(root, "elsewhere"), join(root, "work/linked"));
    expect(scan(4, "", [join(root, "work")]).stdout).toBe("");
  });

  test("a linked worktree, whose .git is a file, is not a repo of its own", () => {
    const root = tempDir();
    folders(root, ["work/api.feat"]);
    writeFile(root, "work/api.feat/.git", "gitdir: /somewhere/.git/worktrees/feat\n");
    expect(scan(4, "", [join(root, "work")]).stdout).toBe("");
  });

  test("never enters a repo or a hidden folder", () => {
    const root = tempDir();
    folders(root, ["work/api/.git", "work/api/vendor/lib/.git", "work/.hidden/x/.git"]);
    expect(scan(4, "", [join(root, "work")]).stdout).toBe(
      `${join(root, "work")}\t${join(root, "work/api")}\t1\n`,
    );
  });

  test("a group folder that doesn't exist finds nothing, and the scan still succeeds", () => {
    expect(scan(4, "", [join(tempDir(), "missing")])).toEqual({ code: 0, stdout: "", stderr: "" });
  });
});

describe("OWNERS_SCRIPT", () => {
  const owners = (dirs: readonly string[]) =>
    runSh(scriptFile(OWNERS_SCRIPT), { args: dirs, env: isolatedGitEnv() }).stdout;

  /** A repo with one commit and a linked worktree beside it. */
  const repoWithWorktree = () => {
    // macOS temp folders sit behind a symlink; git reports the real path.
    const root = realpathSync(tempDir());
    const repo = join(root, "api");
    mkdirSync(join(repo, "src"), { recursive: true });
    git(repo, ["init", "-q", "-b", "main"]);
    git(repo, ["commit", "-q", "--allow-empty", "-m", "start"]);
    git(repo, ["worktree", "add", "-q", "-b", "feature", join(root, "api.feature")]);
    return { root, repo };
  };

  test("a folder in the main checkout names that repo and its worktree count", () => {
    const { repo } = repoWithWorktree();
    expect(owners([join(repo, "src")])).toBe(`${repo}\t2\n`);
  });

  test("a folder in a linked worktree names its repo, through the shared git folder", () => {
    const { root, repo } = repoWithWorktree();
    expect(owners([join(root, "api.feature")])).toBe(`${repo}\t2\n`);
  });

  test("a folder outside every repo, or one that doesn't exist, names nothing", () => {
    const outside = realpathSync(tempDir());
    expect(owners([outside, join(outside, "missing")])).toBe("");
  });

  test("folders in the same repo name it once", () => {
    const { root, repo } = repoWithWorktree();
    expect(owners([join(repo, "src"), join(root, "api.feature"), repo])).toBe(`${repo}\t2\n`);
  });
});

describe("LIST_SCRIPT", () => {
  test("runs wt list --format=json in the repo at $1", () => {
    const root = realpathSync(tempDir());
    mkdirSync(join(root, "api"));
    fakeBin(join(root, "bin"), "wt", 'printf "%s %s" "$PWD" "$*"');
    const run = runSh(scriptFile(LIST_SCRIPT), {
      args: [join(root, "api")],
      env: { PATH: `${join(root, "bin")}:/usr/bin:/bin` },
    });
    expect(run.stdout).toBe(`${join(root, "api")} list --format=json`);
  });
});
