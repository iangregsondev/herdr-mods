import { assert, describe, it } from "@effect/vitest";
import { join } from "node:path";
import { Effect, Result } from "effect";
import { Git } from "./git.ts";
import { git, tempDir, writeFile } from "./test-support.ts";

/** A new repo on `main` with one commit holding `README.md`. */
const repoWithCommit = (): string => {
  const repo = tempDir();
  git(repo, ["init", "-q", "-b", "main"]);
  writeFile(repo, "README.md", "hello\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "first"]);
  return repo;
};

/** Writes `files` (path to content) in `repo` and commits them. */
const commitFiles = (repo: string, files: Record<string, string>): void => {
  Object.entries(files).forEach(([path, content]) => writeFile(repo, path, content));
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "change"]);
};

describe("Git.changedFiles, live layer", () => {
  it.effect("lists the files changed between the base ref and HEAD", () => {
    const repo = repoWithCommit();
    git(repo, ["switch", "-q", "-c", "feature"]);
    commitFiles(repo, { "apps/hello/src/main.ts": "x\n", "docs/a.md": "a\n" });
    return Effect.gen(function* () {
      const service = yield* Git;
      const files = yield* service.changedFiles(repo, "main");
      assert.deepStrictEqual([...files].sort(), ["apps/hello/src/main.ts", "docs/a.md"]);
    }).pipe(Effect.provide(Git.layer));
  });

  it.effect("leaves out files changed on the base after the branch left it", () => {
    const repo = repoWithCommit();
    git(repo, ["switch", "-q", "-c", "feature"]);
    commitFiles(repo, { "apps/hello/src/main.ts": "x\n" });
    git(repo, ["switch", "-q", "main"]);
    commitFiles(repo, { "apps/menus/src/main.ts": "y\n" });
    git(repo, ["switch", "-q", "feature"]);
    return Effect.gen(function* () {
      const service = yield* Git;
      assert.deepStrictEqual(yield* service.changedFiles(repo, "main"), ["apps/hello/src/main.ts"]);
    }).pipe(Effect.provide(Git.layer));
  });

  it.effect("lists both sides of a rename", () => {
    const repo = repoWithCommit();
    commitFiles(repo, { "apps/hello/src/old.ts": "same content\n" });
    git(repo, ["switch", "-q", "-c", "feature"]);
    writeFile(repo, "packages/lib/src/new.ts", "same content\n");
    git(repo, ["rm", "-q", "apps/hello/src/old.ts"]);
    commitFiles(repo, {});
    return Effect.gen(function* () {
      const service = yield* Git;
      const files = yield* service.changedFiles(repo, "main");
      assert.deepStrictEqual([...files].sort(), [
        "apps/hello/src/old.ts",
        "packages/lib/src/new.ts",
      ]);
    }).pipe(Effect.provide(Git.layer));
  });
});

describe("Git.addedFiles, live layer", () => {
  it.effect("lists the files the branch added, not those it changed or deleted", () => {
    const repo = repoWithCommit();
    commitFiles(repo, { "docs/old.md": "old\n", "docs/gone.md": "gone\n" });
    git(repo, ["switch", "-q", "-c", "feature"]);
    git(repo, ["rm", "-q", "docs/gone.md"]);
    commitFiles(repo, { "docs/old.md": "changed\n", ".changeset/new.md": "new\n" });
    return Effect.gen(function* () {
      const service = yield* Git;
      assert.deepStrictEqual(yield* service.addedFiles(repo, "main"), [".changeset/new.md"]);
    }).pipe(Effect.provide(Git.layer));
  });
});

describe("Git, live layer failures", () => {
  it.effect("fails with GitFailed, carrying git's stderr, for a base ref that isn't there", () => {
    const repo = repoWithCommit();
    return Effect.gen(function* () {
      const service = yield* Git;
      const result = yield* Effect.result(service.changedFiles(repo, "no-such-ref"));
      const error = Result.isFailure(result) ? result.failure : undefined;
      assert.strictEqual(error?._tag, "GitFailed");
      assert.include(error?._tag === "GitFailed" ? error.stderr : "", "no-such-ref");
    }).pipe(Effect.provide(Git.layer));
  });

  it.effect("fails with GitNotStarted when git can't start in the folder", () => {
    const missing = join(tempDir(), "not-there");
    return Effect.gen(function* () {
      const service = yield* Git;
      const result = yield* Effect.result(service.originTags(missing));
      const error = Result.isFailure(result) ? result.failure : undefined;
      assert.strictEqual(error?._tag, "GitNotStarted");
      assert.strictEqual(error?.cwd, missing);
    }).pipe(Effect.provide(Git.layer));
  });
});

/** A repo with one commit whose `origin` is a new bare repo, with `main` pushed. */
const repoWithOrigin = (): string => {
  const repo = repoWithCommit();
  const origin = tempDir();
  git(origin, ["init", "-q", "--bare"]);
  git(repo, ["remote", "add", "origin", origin]);
  git(repo, ["push", "-q", "origin", "main"]);
  return repo;
};

describe("Git.originTags, live layer", () => {
  it.effect("lists the tags on origin, not the tags only in the local repo", () => {
    const repo = repoWithOrigin();
    git(repo, ["tag", "iangregsondev-hello@0.1.0"]);
    git(repo, ["tag", "-a", "-m", "annotated", "iangregsondev-menus@0.1.0"]);
    git(repo, ["push", "-q", "origin", "--tags"]);
    git(repo, ["tag", "iangregsondev-worktrunk@0.1.0"]);
    return Effect.gen(function* () {
      const service = yield* Git;
      const tags = yield* service.originTags(repo);
      assert.deepStrictEqual([...tags].sort(), [
        "iangregsondev-hello@0.1.0",
        "iangregsondev-menus@0.1.0",
      ]);
    }).pipe(Effect.provide(Git.layer));
  });
});
