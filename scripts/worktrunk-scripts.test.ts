// The worktrunk panel's shell scripts (apps/worktrunk/src/commands.ts), run for real
// under `sh` against temp folders. They need Node to run, so they live here rather than
// in the mod's own tests.
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  BRANCHES_SCRIPT,
  BRANCH_SCRIPT,
  CI_SCRIPT,
  GONE_SCRIPT,
  JOB_SCRIPT,
  LIST_SCRIPT,
  OWNERS_SCRIPT,
  SCAN_SCRIPT,
  cleanupScript,
  mergeScript,
  newScript,
  quote,
  removeScript,
  shArgs,
} from "../apps/worktrunk/src/commands.ts";
import { THIS_MACHINE } from "../apps/worktrunk/src/machines.ts";
import { currentRepo } from "../apps/worktrunk/src/repos.ts";
import {
  fakeBin,
  fakeLoggingBin,
  git,
  loggedLines,
  isolatedGitEnv,
  runSh,
  tempDir,
  writeFile,
} from "./test-support.ts";

/**
 * `body` exactly as the panel runs it, as a file: `shArgs` puts the script second. Its
 * login shell is `shell`; by default one that keeps the PATH the test gives, so a test's
 * stand-in commands are found.
 */
const scriptFile = (body: string, shell: string = keepPathShell()): string =>
  writeFile(tempDir(), "script.sh", `SHELL=${quote(shell)}\n${shArgs(body, [])[1] ?? ""}`);

/** A login shell whose PATH is the one it was started with. */
const keepPathShell = (): string => {
  const bin = join(tempDir(), "bin");
  fakeBin(bin, "loginsh", 'exec /bin/sh -c "$3"');
  return join(bin, "loginsh");
};

describe("shArgs's script", () => {
  test("runs with the PATH of the person's login shell, whatever its profile prints", () => {
    const bin = join(tempDir(), "bin");
    fakeBin(
      bin,
      "loginsh",
      [
        '[ "$1" = -l ] || { printf "not a login shell"; exit 1; }',
        "printf 'welcome\\n'",
        'PATH=/login/bin exec /bin/sh -c "$3"',
      ].join("\n"),
    );
    const run = runSh(scriptFile('printf %s "$PATH"', join(bin, "loginsh")), {
      env: { PATH: "/usr/bin:/bin" },
    });
    expect(run.stdout).toBe("/login/bin");
  });

  test("with no login shell in $SHELL, runs nothing and fails saying why", () => {
    const run = runSh(scriptFile("printf ran", ""), { env: { PATH: "/usr/bin:/bin" } });
    expect([run.code, run.stdout, run.stderr]).toEqual([
      127,
      "",
      "worktrunk: $SHELL is empty, so the login shell's PATH is unknown\n",
    ]);
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

  test("a group folder that doesn't exist is printed alone on its line; the scan goes on", () => {
    const root = tempDir();
    folders(root, ["work/api/.git"]);
    const missing = join(root, "missing");
    expect(scan(4, "", [missing, join(root, "work")])).toEqual({
      code: 0,
      stdout: `${missing}\n${join(root, "work")}\t${join(root, "work/api")}\t1\n`,
      stderr: "",
    });
  });
});

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

describe("OWNERS_SCRIPT", () => {
  const owners = (dirs: readonly string[]) =>
    runSh(scriptFile(OWNERS_SCRIPT), { args: dirs, env: isolatedGitEnv() }).stdout;

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

describe("the Current repo's lookup: currentRepo over OWNERS_SCRIPT", () => {
  /** The Current repo of `folder`, as the panel looks it up: the script, then its reading. */
  const lookUp = (folder: string) =>
    currentRepo(
      runSh(scriptFile(OWNERS_SCRIPT), { args: [folder], env: isolatedGitEnv() }).stdout,
      THIS_MACHINE,
    );

  test("a folder in the main checkout belongs to that repo", () => {
    const { repo } = repoWithWorktree();
    expect(lookUp(join(repo, "src"))).toEqual(
      Option.some({ machine: THIS_MACHINE, root: repo, count: 2 }),
    );
  });

  test("a linked worktree belongs to its repo, through the shared git folder", () => {
    const { root, repo } = repoWithWorktree();
    expect(lookUp(join(root, "api.feature"))).toEqual(
      Option.some({ machine: THIS_MACHINE, root: repo, count: 2 }),
    );
  });

  test("a folder outside every repo has none", () => {
    expect(lookUp(realpathSync(tempDir()))).toEqual(Option.none());
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

describe("BRANCHES_SCRIPT", () => {
  test("prints the repo's local branches and origin's, by full ref name, and no tags", () => {
    const { repo } = repoWithWorktree();
    git(repo, ["update-ref", "refs/remotes/origin/fix/b", "HEAD"]);
    git(repo, ["tag", "v1"]);
    const run = runSh(scriptFile(BRANCHES_SCRIPT), { args: [repo], env: isolatedGitEnv() });
    expect(run.stdout).toBe("refs/heads/feature\nrefs/heads/main\nrefs/remotes/origin/fix/b\n");
  });
});

describe("BRANCH_SCRIPT", () => {
  const branchAt = (folder: string) =>
    runSh(scriptFile(BRANCH_SCRIPT), { args: [folder], env: isolatedGitEnv() });

  test("prints the branch a folder inside a linked worktree is on", () => {
    const { root } = repoWithWorktree();
    mkdirSync(join(root, "api.feature", "src"));
    expect(branchAt(join(root, "api.feature", "src")).stdout).toBe("feature\n");
  });

  test("prints nothing, and succeeds, for a detached HEAD", () => {
    const { repo } = repoWithWorktree();
    git(repo, ["checkout", "-q", "--detach"]);
    expect(branchAt(repo)).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  test("fails outside every repo", () => {
    expect(branchAt(realpathSync(tempDir())).code).not.toBe(0);
  });
});

describe("CI_SCRIPT", () => {
  test("runs wt list --format=json --full in the repo at $1, for its CI", () => {
    const root = realpathSync(tempDir());
    mkdirSync(join(root, "api"));
    fakeBin(join(root, "bin"), "wt", 'printf "%s %s" "$PWD" "$*"');
    const run = runSh(scriptFile(CI_SCRIPT), {
      args: [join(root, "api")],
      env: { PATH: `${join(root, "bin")}:/usr/bin:/bin` },
    });
    expect(run.stdout).toBe(`${join(root, "api")} list --format=json --full`);
  });
});

describe("quote", () => {
  test("the shell reads back exactly the word that was quoted", () => {
    const tricky = 'a b $HOME `x` "q" it\'s \\ *';
    expect(runSh(scriptFile(`printf %s ${quote(tricky)}`)).stdout).toBe(tricky);
  });
});

/**
 * Runs a job's `body` under `sh` (as the person's shell would) with a fake `wt` program on
 * PATH that logs its arguments; `prelude` goes first, such as a shell function named wt.
 */
const runWithWt = (body: string, prelude = "", failOn = "") => {
  const root = tempDir();
  const log = join(root, "wt.log");
  fakeLoggingBin(join(root, "bin"), "wt", { log });
  // A wt whose calls naming `failOn` fail.
  if (failOn !== "") {
    fakeBin(
      join(root, "bin"),
      "wt",
      `printf '%s\\n' "$*" >> '${log}'; case "$*" in *${failOn}*) exit 1 ;; esac`,
    );
  }
  const run = runSh(scriptFile(`${prelude}${body}`), {
    env: { PATH: `${join(root, "bin")}:/usr/bin:/bin` },
  });
  return { ...run, calls: loggedLines(log) };
};

const WRAPPED = { noWrapper: false };
const PLAIN = { noWrapper: true };
/** A wrapper the person's shell might define: it runs instead of the wt program. */
const WRAPPER = 'wt() { echo wrapped "$@"; }\n';

describe("removeScript", () => {
  test("removes the branches from the main checkout, in the foreground", () => {
    const run = runWithWt(removeScript("/r/my app", ["feat/a", "it's"], WRAPPED));
    expect(run.calls).toEqual(["-C /r/my app remove --foreground feat/a it's"]);
  });

  test("calls plain wt, so a shell function named wt (the person's wrapper) runs", () => {
    const run = runWithWt(removeScript("/r/app", ["a"], WRAPPED), WRAPPER);
    expect([run.stdout, run.calls]).toEqual(["wrapped -C /r/app remove --foreground a\n", []]);
  });

  test("the no-wrapper setting calls the wt program itself, skipping the function", () => {
    const run = runWithWt(removeScript("/r/app", ["a"], PLAIN), WRAPPER);
    expect([run.stdout, run.calls]).toEqual(["", ["-C /r/app remove --foreground a"]]);
  });
});

describe("mergeScript", () => {
  const target = { machine: null, main: "/r/app", path: "/r/app.feat-x", branch: "feat/x" };

  test("squash-merges inside the worktree, then removes it from the main checkout", () => {
    expect(runWithWt(mergeScript(target, "squash", WRAPPED)).calls).toEqual([
      "-C /r/app.feat-x merge --no-remove",
      "-C /r/app remove --foreground feat/x",
    ]);
  });

  test("a merge that fails removes nothing, and the job fails", () => {
    const run = runWithWt(mergeScript(target, "squash", WRAPPED), "", "merge");
    expect([run.code, run.calls]).toEqual([1, ["-C /r/app.feat-x merge --no-remove"]]);
  });

  test("keeping every commit merges with --no-squash", () => {
    expect(runWithWt(mergeScript(target, "keep", WRAPPED)).calls).toEqual([
      "-C /r/app.feat-x merge --no-remove --no-squash",
      "-C /r/app remove --foreground feat/x",
    ]);
  });

  test("the no-wrapper setting skips the wrapper for both the merge and the remove", () => {
    const run = runWithWt(mergeScript(target, "squash", PLAIN), WRAPPER);
    expect([run.stdout, run.calls.length]).toEqual(["", 2]);
  });
});

describe("cleanupScript", () => {
  const batches = [
    { machine: null, main: "/r/app", branches: ["a", "b"], paths: ["/r/app.a", "/r/app.b"] },
    { machine: null, main: "/r/lib", branches: ["c"], paths: ["/r/lib.c"] },
  ];

  test("removes each repo's merged branches from its main checkout", () => {
    const run = runWithWt(cleanupScript(batches, WRAPPED));
    expect([run.code, run.calls]).toEqual([
      0,
      ["-C /r/app remove --foreground a b", "-C /r/lib remove --foreground c"],
    ]);
  });

  test("a repo that fails doesn't stop the others, and the script fails at the end", () => {
    const run = runWithWt(cleanupScript(batches, WRAPPED), "", "/r/app");
    expect([run.code, run.calls]).toEqual([
      1,
      ["-C /r/app remove --foreground a b", "-C /r/lib remove --foreground c"],
    ]);
  });

  test("names each repo, in bold, before its removals", () => {
    const run = runWithWt(cleanupScript(batches, WRAPPED), WRAPPER);
    expect(run.stdout.split("\n")).toEqual([
      "\u001b[1m/r/app\u001b[0m",
      "wrapped -C /r/app remove --foreground a b",
      "\u001b[1m/r/lib\u001b[0m",
      "wrapped -C /r/lib remove --foreground c",
      "",
    ]);
  });

  test("the no-wrapper setting calls the wt program itself for every repo", () => {
    const run = runWithWt(cleanupScript(batches, PLAIN), WRAPPER);
    expect([run.stdout.includes("wrapped"), run.calls.length]).toEqual([false, 2]);
  });
});

describe("newScript", () => {
  /**
   * Runs `newScript` with stand-ins: wt prints its arguments on stderr and a JSON answer
   * on stdout; git knows only the refs in `refs`. Gives wt's arguments and what landed
   * in the out file.
   */
  const runNew = (
    job: { name: string; base: Option.Option<string> },
    refs: readonly string[] = [],
  ) => {
    const out = join(tempDir(), "switch.json");
    const fakes = [
      `wt() { echo "$*" >&2; echo '{"branch":"b"}'; }`,
      `git() { case " ${refs.join(" ")} " in *" $6 "*) return 0 ;; esac; return 1; }`,
      "",
    ].join("\n");
    const run = runSh(scriptFile(fakes + newScript({ main: "/r/app", ...job, out })));
    const written = existsSync(out) ? readFileSync(out, "utf8") : "";
    return { wt: run.stderr.trim(), written };
  };

  test("a new branch is created from the chosen base, and wt's answer saved as JSON", () => {
    expect(runNew({ name: "feat/y", base: Option.some("dev") })).toEqual({
      wt: "-C /r/app switch --create feat/y --base dev --no-cd --format=json",
      written: '{"branch":"b"}\n',
    });
  });

  test("without a base, wt's default branch is the base", () => {
    expect(runNew({ name: "y", base: Option.none() }).wt).toBe(
      "-C /r/app switch --create y --no-cd --format=json",
    );
  });

  test("a branch that exists locally is switched to, not created", () => {
    expect(runNew({ name: "old", base: Option.some("dev") }, ["refs/heads/old"]).wt).toBe(
      "-C /r/app switch old --no-cd --format=json",
    );
  });

  test("a branch only on origin is switched to, so wt makes the local branch", () => {
    expect(runNew({ name: "x", base: Option.none() }, ["refs/remotes/origin/x"]).wt).toBe(
      "-C /r/app switch x --no-cd --format=json",
    );
  });

  test("names, bases and folders reach wt and git as single literal words", () => {
    const out = join(tempDir(), "it's out.json");
    const fakes = `wt() { printf '<%s>' "$@" >&2; }\ngit() { printf '[%s]' "$@" >&2; return 1; }\n`;
    const body = newScript({
      main: "/r/my app",
      name: "it's$(touch pwned)",
      base: Option.some("feat/a b"),
      out,
    });
    expect(runSh(scriptFile(fakes + body), { cwd: tempDir() }).stderr).toBe(
      "[-C][/r/my app][show-ref][--verify][--quiet][refs/heads/it's$(touch pwned)]" +
        "[-C][/r/my app][show-ref][--verify][--quiet][refs/remotes/origin/it's$(touch pwned)]" +
        "<-C></r/my app><switch><--create><it's$(touch pwned)><--base><feat/a b><--no-cd><--format=json>",
    );
    expect(existsSync(out)).toBe(true);
  });

  test.each(["pr:12", "mr:3", "https://github.com/o/r/pull/12", "^", "-", "@"])(
    "wt's shortcut %s goes to wt as it is, never created as a branch",
    (name) => {
      expect(runNew({ name, base: Option.some("dev") }).wt).toBe(
        `-C /r/app switch ${name} --no-cd --format=json`,
      );
    },
  );
});

describe("JOB_SCRIPT", () => {
  /** Runs `body` as a job in a stand-in login shell that reports the flags it was given. */
  const runJob = (body: string, stdin = "") => {
    const bin = join(tempDir(), "bin");
    fakeBin(bin, "fakesh", 'echo "flags: $1 $2 $3"; exec sh -c "$4"');
    return runSh(scriptFile(JOB_SCRIPT), { args: [join(bin, "fakesh"), body], stdin });
  };

  test("runs the body in the person's shell as a login, interactive shell", () => {
    expect(runJob("echo hi").stdout).toMatch(/^flags: -l -i -c\nhi\n/);
  });

  test("a job that succeeds says Done and exits 0", () => {
    const run = runJob("true");
    expect([run.stdout.includes("Done."), run.code]).toEqual([true, 0]);
  });

  test("a job that fails shows its exit code and waits for Enter, then exits with that code", () => {
    const run = runJob("exit 3", "\n");
    expect([run.stdout.includes("Failed (exit 3). Press Enter to close."), run.code]).toEqual([
      true,
      3,
    ]);
  });
});

describe("GONE_SCRIPT", () => {
  test("prints the folders that no longer exist, one per line", () => {
    const root = tempDir();
    const gone = join(root, "no such folder it's");
    expect(runSh(scriptFile(GONE_SCRIPT), { args: [root, gone] }).stdout).toBe(`${gone}\n`);
  });
});
