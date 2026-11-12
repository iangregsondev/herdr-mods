import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, describe, expect, it, test, vi } from "@effect/vitest";
import { Effect } from "effect";
import { devRemove, runDevRemove } from "./dev-remove.ts";
import { DEV_MARKER, hasSlot, type LayoutNode } from "./herdr-slots.ts";
import { fakeBin, fakeHerdrHost, readLayout, slot, tempDir, writeFile } from "./test-support.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const usage = "usage: vp run dev:remove <name>";

/** Writes `<home>/layouts/<name>.json`: a root row holding a slot for each mod given. */
function writeLayout(home: string, name: string, mods: readonly string[]): string {
  const root: LayoutNode = { id: "root", type: "row", children: mods.map(slot) };
  return writeFile(home, `layouts/${name}.json`, JSON.stringify(root));
}

/** A dev build of `mod` in `home`: its folder with the dev marker and a main.js. */
function writeDevBuild(home: string, mod: string): string {
  writeFile(home, `mods/${mod}/${DEV_MARKER}`, "");
  writeFile(home, `mods/${mod}/main.js`, "export default {};\n");
  return join(home, "mods", mod);
}

/**
 * Puts an `ssh` first on PATH that fails as an unreachable host (exit 255) for any
 * call naming `path`, and hands every other call to the `ssh` already on PATH. Call
 * it after `fakeHerdrHost`, so that one is the fake host's.
 */
function dropWhenTouching(path: string): void {
  const bin = join(tempDir(), "bin");
  const quotedPath = `'${process.env.PATH ?? ""}'`;
  fakeBin(
    bin,
    "ssh",
    [
      `case "$*" in *${path}*) echo 'ssh: dropped' >&2; exit 255 ;; esac`,
      `PATH=${quotedPath} exec ssh "$@"`,
    ].join("\n"),
  );
  vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
}

describe("devRemove", () => {
  test.each([
    ["no name", []],
    ["two names", ["hello", "other"]],
    ["a name with a slash", ["../hello"]],
    ["a name with a slash inside", ["a/b"]],
    ["a name starting with a dot", [".hidden"]],
  ])("rejects %s with code 2 and the usage line", (_label, args) => {
    const home = tempDir();
    writeDevBuild(home, "hello");
    expect(devRemove(args, home)).toEqual({ code: 2, out: [], err: [usage] });
    expect(existsSync(join(home, "mods", "hello"))).toBe(true);
  });

  test("leaves an installed mod and its slots alone, with code 1", () => {
    const home = tempDir();
    writeFile(home, "mods/hello/main.js", "export default {};\n");
    const layout = writeLayout(home, "work", ["hello"]);
    const dir = join(home, "mods", "hello");

    expect(devRemove(["hello"], home)).toEqual({
      code: 1,
      out: [],
      err: [`dev-remove: ${dir} is an installed mod, not a dev build; left alone`],
    });
    expect(existsSync(join(dir, "main.js"))).toBe(true);
    expect(hasSlot(readLayout(layout), "hello")).toBe(true);
  });

  test("removes a dev build's folder and says so", () => {
    const home = tempDir();
    const dir = writeDevBuild(home, "hello");

    const result = devRemove(["hello"], home);
    expect(result.code).toBe(0);
    expect(result.err).toEqual([]);
    expect(result.out[0]).toBe(`dev-remove: removed ${dir}`);
    expect(existsSync(dir)).toBe(false);
  });

  test("says there are no files when the mod has no folder", () => {
    const home = tempDir();
    const result = devRemove(["hello"], home);
    expect(result.code).toBe(0);
    expect(result.out[0]).toBe(`dev-remove: no files at ${join(home, "mods", "hello")}`);
  });

  test("removes the mod's slots and names each layout it changed", () => {
    const home = tempDir();
    writeDevBuild(home, "hello");
    const work = writeLayout(home, "work", ["tabs", "hello"]);
    const play = writeLayout(home, "play", ["hello"]);
    const other = writeLayout(home, "other", ["tabs"]);
    const otherBefore = readFileSync(other, "utf8");

    const result = devRemove(["hello"], home);
    expect(result.out[1]).toBe('dev-remove: removed the hello panel from "play", "work"');
    expect(hasSlot(readLayout(work), "hello")).toBe(false);
    expect(hasSlot(readLayout(work), "tabs")).toBe(true);
    expect(hasSlot(readLayout(play), "hello")).toBe(false);
    expect(readFileSync(other, "utf8")).toBe(otherBefore);
  });

  test("says there is no panel when no layout has a slot for the mod", () => {
    const home = tempDir();
    writeDevBuild(home, "hello");
    writeLayout(home, "work", ["tabs"]);
    expect(devRemove(["hello"], home).out[1]).toBe("dev-remove: no hello panel in your layouts");
  });

  test("still removes the folder and cleans readable layouts when one layout can't be read, with code 1", () => {
    const home = tempDir();
    const dir = writeDevBuild(home, "hello");
    const work = writeLayout(home, "work", ["tabs", "hello"]);
    const bad = writeFile(home, "layouts/bad.json", "{");

    expect(devRemove(["hello"], home)).toEqual({
      code: 1,
      out: [`dev-remove: removed ${dir}`, 'dev-remove: removed the hello panel from "work"'],
      err: ['dev-remove: could not read these layouts, so left them alone: "bad"'],
    });
    expect(existsSync(dir)).toBe(false);
    expect(hasSlot(readLayout(work), "hello")).toBe(false);
    expect(hasSlot(readLayout(work), "tabs")).toBe(true);
    expect(readFileSync(bad, "utf8")).toBe("{");
  });
});

describe("dev-remove CLI", () => {
  function run(args: readonly string[], home: string) {
    return spawnSync("vpx", ["scripts/dev-remove.ts", ...args], {
      cwd: repoRoot,
      env: { ...process.env, HERDR_APP_HOME: home },
      encoding: "utf8",
    });
  }

  test("prints its lines to the shell and exits 0", () => {
    const home = tempDir();
    const dir = writeDevBuild(home, "hello");
    writeLayout(home, "work", ["hello"]);

    const result = run(["hello"], home);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      `dev-remove: removed ${dir}\ndev-remove: removed the hello panel from "work"\n`,
    );
    expect(existsSync(dir)).toBe(false);
  });

  test("prints the usage line to stderr and exits 2", () => {
    const home = tempDir();
    const result = run([], home);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${usage}\n`);
  });
});

describe("runDevRemove, remote target", () => {
  it.effect("removes a dev build's folder on the Herdr host and says so", () => {
    const fake = fakeHerdrHost();
    const dir = writeDevBuild(fake.home, "hello");
    return Effect.gen(function* () {
      const result = yield* runDevRemove(["hello"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 0,
        out: [
          "dev-remove: removed ann@herdr-host:~/.config/herdr-app/mods/hello",
          "dev-remove: no hello panel in your layouts",
        ],
        err: [],
      });
      assert.isFalse(existsSync(dir));
    });
  });

  it.effect("leaves an installed mod and its slots alone on the Herdr host, with code 1", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, "mods/hello/main.js", "export default {};\n");
    const layout = writeLayout(fake.home, "work", ["hello"]);
    return Effect.gen(function* () {
      const result = yield* runDevRemove(["hello"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        out: [],
        err: [
          "dev-remove: ann@herdr-host:~/.config/herdr-app/mods/hello is an installed mod, " +
            "not a dev build; left alone",
        ],
      });
      assert.isTrue(existsSync(join(fake.home, "mods/hello/main.js")));
      assert.isTrue(hasSlot(readLayout(layout), "hello"));
    });
  });

  it.effect("removes the mod's slots from the host's layouts and names each one it changed", () => {
    const fake = fakeHerdrHost();
    writeDevBuild(fake.home, "hello");
    const work = writeLayout(fake.home, "work", ["tabs", "hello"]);
    const play = writeLayout(fake.home, "play", ["hello"]);
    const other = writeLayout(fake.home, "other", ["tabs"]);
    const otherBefore = readFileSync(other, "utf8");
    return Effect.gen(function* () {
      const result = yield* runDevRemove(["hello"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.strictEqual(result.code, 0);
      assert.strictEqual(result.out[1], 'dev-remove: removed the hello panel from "play", "work"');
      assert.isFalse(hasSlot(readLayout(work), "hello"));
      assert.isTrue(hasSlot(readLayout(work), "tabs"));
      assert.isFalse(hasSlot(readLayout(play), "hello"));
      assert.strictEqual(readFileSync(other, "utf8"), otherBefore);
    });
  });

  it.effect("never edits a layout that ships with Herdr", () => {
    const fake = fakeHerdrHost();
    writeDevBuild(fake.home, "hello");
    writeFile(fake.home, "installed.json", JSON.stringify({ "layout:default": {} }));
    const shipped = writeLayout(fake.home, "default", ["hello"]);
    const shippedBefore = readFileSync(shipped, "utf8");
    return Effect.gen(function* () {
      const result = yield* runDevRemove(["hello"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.strictEqual(result.code, 0);
      assert.strictEqual(result.out[1], "dev-remove: no hello panel in your layouts");
      assert.strictEqual(readFileSync(shipped, "utf8"), shippedBefore);
    });
  });

  it.effect("skips and names a layout it can't read, cleans the rest, with code 1", () => {
    const fake = fakeHerdrHost();
    writeDevBuild(fake.home, "hello");
    const work = writeLayout(fake.home, "work", ["tabs", "hello"]);
    const bad = writeFile(fake.home, "layouts/bad.json", "{");
    return Effect.gen(function* () {
      const result = yield* runDevRemove(["hello"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        out: [
          "dev-remove: removed ann@herdr-host:~/.config/herdr-app/mods/hello",
          'dev-remove: removed the hello panel from "work"',
        ],
        err: ['dev-remove: could not read these layouts, so left them alone: "bad"'],
      });
      assert.isFalse(hasSlot(readLayout(work), "hello"));
      assert.strictEqual(readFileSync(bad, "utf8"), "{");
    });
  });
});

describe("runDevRemove, unreachable host", () => {
  it.effect("exits 1 saying the Herdr host is unreachable, and changes nothing", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    const dir = writeDevBuild(fake.home, "hello");
    const layout = writeLayout(fake.home, "work", ["hello"]);
    const layoutBefore = readFileSync(layout, "utf8");
    return Effect.gen(function* () {
      const result = yield* runDevRemove(["hello"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        out: [],
        err: [
          "dev-remove: Herdr host unreachable: ann@herdr-host:2222 " +
            "(ssh: connect to host herdr-host port 2222: Connection refused)",
        ],
      });
      assert.isTrue(existsSync(join(dir, "main.js")));
      assert.strictEqual(readFileSync(layout, "utf8"), layoutBefore);
    });
  });

  it.effect("exits 1 and changes nothing when the host drops while layouts are read", () => {
    const fake = fakeHerdrHost();
    dropWhenTouching("layouts/work.json");
    const dir = writeDevBuild(fake.home, "hello");
    const play = writeLayout(fake.home, "play", ["hello"]);
    const work = writeLayout(fake.home, "work", ["hello"]);
    const playBefore = readFileSync(play, "utf8");
    const workBefore = readFileSync(work, "utf8");
    return Effect.gen(function* () {
      const result = yield* runDevRemove(["hello"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        out: [],
        err: ["dev-remove: Herdr host unreachable: ann@herdr-host:2222 (ssh: dropped)"],
      });
      assert.isTrue(existsSync(join(dir, "main.js")));
      assert.strictEqual(readFileSync(play, "utf8"), playBefore);
      assert.strictEqual(readFileSync(work, "utf8"), workBefore);
    });
  });
});
