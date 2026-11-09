import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vite-plus/test";
import { modPack as modPackConfig, type ModPackOptions } from "../mod-pack.ts";
import { DEV_MARKER, type Place } from "./herdr-slots.ts";
import { tempDir, writeFile } from "./test-support.ts";

type PackConfig = ReturnType<typeof modPackConfig>;
type SinglePack = Exclude<PackConfig, readonly unknown[]>;

/** modPack's config, narrowed from vp's "one config or a list" type to the one it returns. */
function modPack(name: string, options?: ModPackOptions): SinglePack {
  const config = modPackConfig(name, options);
  if (Array.isArray(config)) throw new Error("modPack returned a list of configs");
  return config;
}

type SlotCall = [string, { place?: Place; size?: number }, { home: string }];

/** A temp Herdr home with an empty mods/ folder. */
function herdrHomeWithMods(): string {
  const home = tempDir();
  mkdirSync(join(home, "mods"));
  return home;
}

/** A temp mod source folder whose assets/mod.json holds `modJson`. */
function modSource(modJson: object): string {
  const dir = tempDir();
  writeFile(dir, "assets/mod.json", JSON.stringify(modJson));
  return dir;
}

/** Runs the config's onSuccess hook the way vp pack does after a good build. */
function runOnSuccess(config: SinglePack): void {
  const { onSuccess } = config;
  if (typeof onSuccess !== "function") throw new Error("no onSuccess function");
  // vp pack passes its resolved config and an abort signal; the hook reads neither.
  void onSuccess(...([] as unknown as Parameters<typeof onSuccess>));
}

describe("modPack, build mode", () => {
  const config = () => modPack("hello", { watch: false, home: herdrHomeWithMods() });

  test("builds into the repo's mods/<name> and cleans it first", () => {
    expect(config().outDir).toBe("../../mods/hello");
    expect(config().clean).toBe(true);
  });

  test("has no onSuccess hook", () => {
    expect(config().onSuccess).toBeUndefined();
  });

  test("never bundles the Herdr built-ins", () => {
    expect(config().deps?.neverBundle).toEqual(expect.arrayContaining(["herdr", "gpui-kit"]));
  });

  test("copies the assets into the out dir", () => {
    expect(config().copy).toEqual([{ from: "assets/*", to: "../../mods/hello" }]);
  });

  test("builds src/main.ts as readable ESM", () => {
    const built = config();
    expect(built.entry).toEqual({ main: "src/main.ts" });
    expect(built.format).toBe("esm");
    expect(built.minify).toBe(false);
  });

  test("never touches the Herdr home", () => {
    const home = herdrHomeWithMods();
    modPack("hello", { watch: false, home });
    expect(readdirSync(join(home, "mods"))).toEqual([]);
  });
});

describe("modPack, watch mode", () => {
  test("builds into <home>/mods/<name> and marks it as a dev build", () => {
    const home = herdrHomeWithMods();
    const config = modPack("hello", { watch: true, home, ensureSlot: () => "" });
    const dir = join(home, "mods", "hello");
    expect(config.outDir).toBe(dir);
    expect(existsSync(join(dir, DEV_MARKER))).toBe(true);
    expect(config.copy).toEqual([{ from: "assets/*", to: dir }]);
  });

  test("never cleans the out dir", () => {
    const config = modPack("hello", { watch: true, home: herdrHomeWithMods() });
    expect(config.clean).toBe(false);
  });

  test("throws, naming the home, when the home has no mods/ folder", () => {
    const home = tempDir();
    expect(() => modPack("hello", { watch: true, home })).toThrow(home);
    expect(existsSync(join(home, "mods"))).toBe(false);
  });

  test("refuses an installed mod folder and leaves it untouched", () => {
    const home = herdrHomeWithMods();
    const dir = join(home, "mods", "hello");
    writeFile(dir, "main.js", "installed");
    expect(() => modPack("hello", { watch: true, home })).toThrow(/installed mod/);
    expect(readdirSync(dir)).toEqual(["main.js"]);
    expect(readFileSync(join(dir, "main.js"), "utf8")).toBe("installed");
  });

  test("reuses an existing dev build, keeping its files", () => {
    const home = herdrHomeWithMods();
    const dir = join(home, "mods", "hello");
    writeFile(dir, DEV_MARKER, "old marker");
    writeFile(dir, "main.js", "previous build");
    const config = modPack("hello", { watch: true, home });
    expect(config.outDir).toBe(dir);
    expect(readFileSync(join(dir, "main.js"), "utf8")).toBe("previous build");
  });

  test("puts the slot back once, from the mod's own mod.json, after the first build", () => {
    const home = herdrHomeWithMods();
    const modJson = { place: "left", size: 240 };
    const modDir = modSource(modJson);
    const ensureSlot = vi.fn((..._args: SlotCall) => "slot line");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = modPack("hello", { watch: true, home, modDir, ensureSlot });
    expect(ensureSlot).not.toHaveBeenCalled();

    runOnSuccess(config);
    runOnSuccess(config);
    runOnSuccess(config);

    expect(ensureSlot).toHaveBeenCalledTimes(1);
    expect(ensureSlot).toHaveBeenCalledWith("hello", modJson, { home });
    expect(log).toHaveBeenCalledWith("slot line");
    log.mockRestore();
  });
});
