import { assert, describe, it } from "@effect/vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { runReleaseTags } from "./release-tags.ts";
import { git, tempDir, writeFile } from "./test-support.ts";

/** A `package.json` for a package called `name` at `version`. */
const packageJson = (name: string, version: string): string =>
  `${JSON.stringify({ name, version, private: true }, null, 2)}\n`;

/**
 * A repo laid out like this one: a root package, `packages/worktrunk-mailbox`, and an
 * `apps/<name>` package for each mod in `mods` (name to version), committed on `main`
 * and pushed to an `origin` that is a new bare repo.
 */
const repoWithMods = (mods: Record<string, string>): string => {
  const repo = tempDir();
  git(repo, ["init", "-q", "-b", "main"]);
  writeFile(repo, "package.json", packageJson("herdr-mods", "0.0.0"));
  writeFile(
    repo,
    "packages/worktrunk-mailbox/package.json",
    packageJson("worktrunk-mailbox", "0.0.0"),
  );
  Object.entries(mods).forEach(([name, version]) =>
    writeFile(repo, `apps/${name}/package.json`, packageJson(name, version)),
  );
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "mods"]);
  const origin = tempDir();
  git(origin, ["init", "-q", "--bare"]);
  git(repo, ["remote", "add", "origin", origin]);
  git(repo, ["push", "-q", "origin", "main"]);
  return repo;
};

/** Tags HEAD with each of `tags` and pushes them to `origin`. */
const pushTags = (repo: string, tags: ReadonlyArray<string>): void => {
  tags.forEach((tag) => git(repo, ["tag", tag]));
  git(repo, ["push", "-q", "origin", "--tags"]);
};

/** The NDJSON events in `file`, parsed; none when the file isn't there. */
const events = (file: string): ReadonlyArray<unknown> =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line): unknown => JSON.parse(line))
    : [];

/** A path for the output file, in a new temp folder; the file itself isn't made. */
const outputPath = (): string => join(tempDir(), "changesets-output.ndjson");

describe("runReleaseTags", () => {
  it.effect("writes one git-tag event per mod whose mod-id tag isn't on origin", () => {
    const repo = repoWithMods({ hello: "0.1.0", menus: "0.2.0" });
    const output = outputPath();
    return Effect.gen(function* () {
      const result = yield* runReleaseTags({ repo, output });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout:
          "release:tags: iangregsondev-hello@0.1.0\nrelease:tags: iangregsondev-menus@0.2.0\n",
        stderr: "",
      });
      assert.deepStrictEqual(events(output), [
        { type: "git-tag", tag: "iangregsondev-hello@0.1.0", packageName: "hello" },
        { type: "git-tag", tag: "iangregsondev-menus@0.2.0", packageName: "menus" },
      ]);
    });
  });

  it.effect("writes nothing when every mod-id tag is already on origin", () => {
    const repo = repoWithMods({ hello: "0.1.0", menus: "0.2.0" });
    pushTags(repo, ["iangregsondev-hello@0.1.0", "iangregsondev-menus@0.2.0"]);
    const output = outputPath();
    return Effect.gen(function* () {
      const result = yield* runReleaseTags({ repo, output });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "release:tags: nothing to release\n",
        stderr: "",
      });
      assert.deepStrictEqual(events(output), []);
    });
  });

  it.effect("says only that there is nothing to release when every mod is at 0.0.0", () => {
    const repo = repoWithMods({ hello: "0.0.0" });
    const output = outputPath();
    return Effect.gen(function* () {
      const result = yield* runReleaseTags({ repo, output });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "release:tags: nothing to release\n",
        stderr: "",
      });
      assert.deepStrictEqual(events(output), []);
    });
  });

  it.effect("exits 1 naming CHANGESETS_OUTPUT when no output file is given", () => {
    const repo = repoWithMods({ hello: "0.1.0" });
    return Effect.gen(function* () {
      const result = yield* runReleaseTags({ repo, output: undefined });
      assert.strictEqual(result.code, 1);
      assert.include(result.stderr, "CHANGESETS_OUTPUT");
    });
  });

  it.effect(
    "exits 1 with git's message and exit code, and writes nothing, when origin can't be read",
    () => {
      const repo = repoWithMods({ hello: "0.1.0" });
      git(repo, ["remote", "remove", "origin"]);
      const output = outputPath();
      return Effect.gen(function* () {
        const result = yield* runReleaseTags({ repo, output });
        assert.strictEqual(result.code, 1);
        assert.include(result.stderr, "origin");
        assert.include(result.stderr, "(exit 128)");
        assert.deepStrictEqual(events(output), []);
      });
    },
  );

  it.effect("exits 1 naming a mod's package.json that has no version, and writes nothing", () => {
    const repo = repoWithMods({ hello: "0.1.0" });
    const broken = writeFile(
      repo,
      "apps/menus/package.json",
      `${JSON.stringify({ name: "menus" })}\n`,
    );
    const output = outputPath();
    return Effect.gen(function* () {
      const result = yield* runReleaseTags({ repo, output });
      assert.strictEqual(result.code, 1);
      assert.include(result.stderr, broken);
      assert.deepStrictEqual(events(output), []);
    });
  });

  it.effect("exits 1 naming the output file when it can't be written", () => {
    const repo = repoWithMods({ hello: "0.1.0" });
    const output = join(tempDir(), "no-such-folder", "changesets-output.ndjson");
    return Effect.gen(function* () {
      const result = yield* runReleaseTags({ repo, output });
      assert.strictEqual(result.code, 1);
      assert.include(result.stderr, output);
    });
  });

  it.effect(
    "lists a mod whose earlier version is tagged, and ignores tags not named by mod id",
    () => {
      const repo = repoWithMods({ hello: "0.2.0", menus: "0.1.0", worktrunk: "0.1.0" });
      pushTags(repo, ["iangregsondev-hello@0.1.0", "menus@0.1.0", "iangregsondev-worktrunk@0.1.0"]);
      const output = outputPath();
      return Effect.gen(function* () {
        yield* runReleaseTags({ repo, output });
        assert.deepStrictEqual(events(output), [
          { type: "git-tag", tag: "iangregsondev-hello@0.2.0", packageName: "hello" },
          { type: "git-tag", tag: "iangregsondev-menus@0.1.0", packageName: "menus" },
        ]);
      });
    },
  );

  it.effect("never lists worktrunk-mailbox or the root package", () => {
    const repo = repoWithMods({ hello: "0.1.0" });
    pushTags(repo, ["iangregsondev-hello@0.1.0"]);
    const output = outputPath();
    return Effect.gen(function* () {
      const result = yield* runReleaseTags({ repo, output });
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(events(output), []);
    });
  });

  it.effect("appends to the output file, keeping what is already there", () => {
    const repo = repoWithMods({ hello: "0.1.0" });
    const output = writeFile(tempDir(), "changesets-output.ndjson", '{"type":"other"}\n');
    return Effect.gen(function* () {
      yield* runReleaseTags({ repo, output });
      assert.deepStrictEqual(events(output), [
        { type: "other" },
        { type: "git-tag", tag: "iangregsondev-hello@0.1.0", packageName: "hello" },
      ]);
    });
  });

  it.effect("writes no event for a mod still at 0.0.0, which has never been released", () => {
    const repo = repoWithMods({ hello: "0.0.0", menus: "0.1.0" });
    const output = outputPath();
    return Effect.gen(function* () {
      yield* runReleaseTags({ repo, output });
      assert.deepStrictEqual(events(output), [
        { type: "git-tag", tag: "iangregsondev-menus@0.1.0", packageName: "menus" },
      ]);
    });
  });
});
