import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { devRemove } from "./dev-remove.ts";
import { DEV_MARKER, hasSlot, type LayoutNode } from "./herdr-slots.ts";
import { readLayout, slot, tempDir, writeFile } from "./test-support.ts";

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
