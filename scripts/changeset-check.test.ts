import { assert, describe, it } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Result } from "effect";
import { parseChangeset, runChangesetCheck } from "./changeset-check.ts";
import { git, isolatedGitEnv, tempDir, writeFile } from "./test-support.ts";

/**
 * A repo whose `main` holds two mods, a package, docs and the changesets config, with
 * HEAD on a new branch `feature` that has no commits of its own yet.
 */
const prRepo = (): string => {
  const repo = tempDir();
  git(repo, ["init", "-q", "-b", "main"]);
  writeFile(repo, "apps/hello/src/main.ts", "hello\n");
  writeFile(repo, "apps/menus/src/main.ts", "menus\n");
  writeFile(repo, "packages/lib/src/index.ts", "lib\n");
  writeFile(repo, "docs/develop.md", "docs\n");
  writeFile(repo, "scripts/tool.ts", "tool\n");
  writeFile(repo, ".changeset/config.json", "{}\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "base"]);
  git(repo, ["switch", "-q", "-c", "feature"]);
  return repo;
};

/** Writes `files` (path to content) in `repo` and commits them on HEAD's branch. */
const commitFiles = (repo: string, files: Record<string, string>): void => {
  Object.entries(files).forEach(([path, content]) => writeFile(repo, path, content));
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "change"]);
};

describe("parseChangeset", () => {
  it("reads each package named in the frontmatter with its bump", () => {
    const text = '---\n"hello": minor\n"menus": patch\n---\n\nSaid hello.\n';
    assert.deepStrictEqual(
      parseChangeset(text),
      Result.succeed({ hello: "minor", menus: "patch" }),
    );
  });

  it("reads an empty frontmatter as an empty changeset", () => {
    assert.deepStrictEqual(parseChangeset("---\n---\n"), Result.succeed({}));
  });

  it("reads unquoted package names and ignores the summary below the frontmatter", () => {
    const text = "---\nworktrunk: major\n---\n\npr: #17\n\nhello: not a bump\n";
    assert.deepStrictEqual(parseChangeset(text), Result.succeed({ worktrunk: "major" }));
  });
});

describe("parseChangeset, malformed", () => {
  it("fails naming a frontmatter line that isn't a package and a bump", () => {
    const text = '---\n"hello": huge\n---\n\nSaid hello.\n';
    assert.deepStrictEqual(
      parseChangeset(text),
      Result.fail('frontmatter line isn\'t "<package>": major|minor|patch: "hello": huge'),
    );
  });

  it("fails when the file has no closing frontmatter line", () => {
    assert.deepStrictEqual(
      parseChangeset('---\n"hello": minor\n\nSaid hello.\n'),
      Result.fail("no frontmatter: the file must open and close with a --- line"),
    );
  });
});

describe("runChangesetCheck, mods", () => {
  it.effect("fails naming a changed mod with no changeset, and says how to add one", () => {
    const repo = prRepo();
    commitFiles(repo, { "apps/hello/src/main.ts": "hello again\n" });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr:
          "changeset-check: no changeset names these changed mods: hello\n" +
          "changeset-check: add one with: vp exec changeset\n",
      });
    });
  });

  it.effect("passes when a changeset the PR adds names the changed mod", () => {
    const repo = prRepo();
    commitFiles(repo, {
      "apps/hello/src/main.ts": "hello again\n",
      ".changeset/brave-cats.md": '---\n"hello": patch\n---\n\nhello says it again.\n',
    });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "changeset-check: every changed mod and package has a changeset\n",
        stderr: "",
      });
    });
  });

  it.effect("fails for a changed mod named only in a changeset for another mod", () => {
    const repo = prRepo();
    commitFiles(repo, {
      "apps/hello/src/main.ts": "hello again\n",
      ".changeset/brave-cats.md": '---\n"menus": patch\n---\n\nmenus changed.\n',
    });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.deepStrictEqual(result.code, 1);
      assert.include(result.stderr, "no changeset names these changed mods: hello\n");
    });
  });
});

describe("runChangesetCheck, changesets already on the base", () => {
  it.effect("doesn't count a changeset the base already holds, even one the PR edits", () => {
    const repo = prRepo();
    git(repo, ["switch", "-q", "main"]);
    commitFiles(repo, { ".changeset/old-news.md": '---\n"hello": patch\n---\n\nold.\n' });
    git(repo, ["switch", "-q", "-C", "feature"]);
    commitFiles(repo, {
      "apps/hello/src/main.ts": "hello again\n",
      ".changeset/old-news.md": '---\n"hello": patch\n---\n\nold, reworded.\n',
    });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.strictEqual(result.code, 1);
      assert.include(result.stderr, "no changeset names these changed mods: hello\n");
    });
  });
});

describe("runChangesetCheck, nothing that needs a changeset", () => {
  it.effect("passes when the PR changes no file", () => {
    const repo = prRepo();
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.strictEqual(result.code, 0);
    });
  });

  it.effect("passes a change to root scripts, docs, CI and config with no changeset", () => {
    const repo = prRepo();
    commitFiles(repo, {
      "scripts/tool.ts": "tool again\n",
      "docs/develop.md": "docs again\n",
      ".github/workflows/ci.yml": "name: CI\n",
      "package.json": "{}\n",
      "mods/iangregsondev-hello/main.js": "// built\n",
    });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "changeset-check: every changed mod and package has a changeset\n",
        stderr: "",
      });
    });
  });
});

describe("runChangesetCheck, packages", () => {
  it.effect("fails a packages/ change with no changeset at all", () => {
    const repo = prRepo();
    commitFiles(repo, { "packages/lib/src/index.ts": "lib again\n" });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr:
          "changeset-check: packages/ changed, so the PR needs a changeset: name the mods it " +
          "reaches, or add an empty one (vp exec changeset --empty)\n" +
          "changeset-check: add one with: vp exec changeset\n",
      });
    });
  });

  it.effect("doesn't count the .changeset/README.md the PR adds as a changeset", () => {
    const repo = prRepo();
    commitFiles(repo, {
      "packages/lib/src/index.ts": "lib again\n",
      ".changeset/README.md": "---\n---\n",
    });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.strictEqual(result.code, 1);
    });
  });

  it.effect("passes a packages/ change with an empty changeset", () => {
    const repo = prRepo();
    commitFiles(repo, {
      "packages/lib/src/index.ts": "lib again\n",
      ".changeset/quiet-owls.md": "---\n---\n",
    });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.strictEqual(result.code, 0);
    });
  });
});

describe("runChangesetCheck, malformed changeset", () => {
  it.effect("fails naming the file and what is wrong with it", () => {
    const repo = prRepo();
    commitFiles(repo, {
      "apps/hello/src/main.ts": "hello again\n",
      ".changeset/brave-cats.md": '---\n"hello": huge\n---\n\nhello again.\n',
    });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr:
          "changeset-check: .changeset/brave-cats.md: frontmatter line isn't " +
          '"<package>": major|minor|patch: "hello": huge\n',
      });
    });
  });
});

describe("runChangesetCheck, unreadable changeset", () => {
  it.effect("exits 1 naming a changeset that can't be read", () => {
    const repo = prRepo();
    commitFiles(repo, {
      "apps/hello/src/main.ts": "hello again\n",
      ".changeset/brave-cats.md": '---\n"hello": patch\n---\n\nhello again.\n',
    });
    chmodSync(join(repo, ".changeset/brave-cats.md"), 0o000);
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "main" });
      assert.strictEqual(result.code, 1);
      assert.match(
        result.stderr,
        /^changeset-check: couldn't read \.changeset\/brave-cats\.md \(EACCES/,
      );
    });
  });
});

describe("runChangesetCheck, the version PR", () => {
  it.effect("skips the changesets version branch, which bumps mods and deletes changesets", () => {
    const repo = prRepo();
    commitFiles(repo, { ".changeset/brave-cats.md": '---\n"hello": patch\n---\n\nhello.\n' });
    git(repo, ["switch", "-q", "-c", "changeset-release/main"]);
    git(repo, ["rm", "-q", ".changeset/brave-cats.md"]);
    commitFiles(repo, { "apps/hello/CHANGELOG.md": "# hello\n" });
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({
        repo,
        base: "feature",
        headBranch: "changeset-release/main",
      });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout:
          "changeset-check: skipped: changeset-release/main is the changesets version branch\n",
        stderr: "",
      });
    });
  });
});

describe("runChangesetCheck, git fails", () => {
  it.effect("exits 1 with git's error when the base ref isn't there", () => {
    const repo = prRepo();
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo, base: "no-such-ref" });
      assert.strictEqual(result.code, 1);
      assert.match(
        result.stderr,
        /^changeset-check: git diff --name-only --no-renames -z no-such-ref\.\.\.HEAD failed \(exit 128\): .*no-such-ref/,
      );
    });
  });

  it.effect("exits 1 naming the folder when git can't start there", () => {
    const missing = join(tempDir(), "not-there");
    return Effect.gen(function* () {
      const result = yield* runChangesetCheck({ repo: missing, base: "main" });
      assert.strictEqual(result.code, 1);
      assert.match(
        result.stderr,
        new RegExp(`^changeset-check: couldn't run git in ${missing} \\(.*ENOENT`),
      );
    });
  });
});

/** Runs the CLI in `cwd` with `env` merged over this process's env and git isolated. */
const runCli = (cwd: string, env: Record<string, string>) => {
  const result = spawnSync("vpx", [fileURLToPath(new URL("changeset-check.ts", import.meta.url))], {
    cwd,
    env: Object.fromEntries(
      Object.entries({ ...process.env, ...isolatedGitEnv(), ...env }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe("changeset-check CLI", () => {
  it("checks the PR against origin/<GITHUB_BASE_REF> and exits 1 naming the mod", () => {
    const upstream = prRepo();
    git(upstream, ["switch", "-q", "main"]);
    const clone = join(tempDir(), "clone");
    git(tempDir(), ["clone", "-q", upstream, clone]);
    git(clone, ["switch", "-q", "-c", "feature"]);
    commitFiles(clone, { "apps/menus/src/main.ts": "menus again\n" });
    assert.deepStrictEqual(runCli(clone, { GITHUB_BASE_REF: "main", GITHUB_HEAD_REF: "feature" }), {
      code: 1,
      stdout: "",
      stderr:
        "changeset-check: no changeset names these changed mods: menus\n" +
        "changeset-check: add one with: vp exec changeset\n",
    });
  });

  it("skips when GITHUB_HEAD_REF is the version branch", () => {
    const repo = prRepo();
    assert.deepStrictEqual(runCli(repo, { GITHUB_HEAD_REF: "changeset-release/main" }), {
      code: 0,
      stdout: "changeset-check: skipped: changeset-release/main is the changesets version branch\n",
      stderr: "",
    });
  });
});
