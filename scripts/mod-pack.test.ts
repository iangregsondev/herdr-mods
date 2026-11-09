import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, onTestFinished, test, vi } from "vite-plus/test";
import {
  type EnsureSlot,
  modPack as modPackConfig,
  type ModPackOptions,
  watchFromArgv,
} from "../mod-pack.ts";
import { DEV_MARKER, type ModJson } from "./herdr-slots.ts";
import { tempDir, writeFile } from "./test-support.ts";

type PackConfig = ReturnType<typeof modPackConfig>;
type SinglePack = Exclude<PackConfig, readonly unknown[]>;

/** An `ensureSlot` that fails the test if called: no test reaches the real Herdr app. */
const unexpectedEnsureSlot: EnsureSlot = (mod) => {
  throw new Error(`ensureSlot called for ${mod} in a test that gave it no fake`);
};

/**
 * modPack's config, narrowed from vp's "one config or a list" type to the one it returns.
 * `ensureSlot` defaults to `unexpectedEnsureSlot`.
 */
function modPack(name: string, options: ModPackOptions = {}): SinglePack {
  const config = modPackConfig(name, { ensureSlot: unexpectedEnsureSlot, ...options });
  if (Array.isArray(config)) throw new Error("modPack returned a list of configs");
  return config;
}

type SlotCall = Parameters<EnsureSlot>;

/** An `ensureSlot` fake that records each call and returns `line`. */
function recordingEnsureSlot(line: string): { ensureSlot: EnsureSlot; calls: SlotCall[] } {
  const calls: SlotCall[] = [];
  const ensureSlot: EnsureSlot = (...args) => {
    calls.push(args);
    return line;
  };
  return { ensureSlot, calls };
}

/** Silences console.log for the current test and returns the spy; restored when it finishes. */
function silencedLog() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());
  return log;
}

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
async function runOnSuccess(config: SinglePack): Promise<void> {
  const { onSuccess } = config;
  if (typeof onSuccess !== "function") throw new Error("no onSuccess function");
  // vp pack passes its resolved config and an abort signal; the hook reads neither.
  await onSuccess(...([] as unknown as Parameters<typeof onSuccess>));
}

describe("watchFromArgv", () => {
  test("is true with --watch", () => {
    expect(watchFromArgv(["node", "vp", "pack", "--watch"])).toBe(true);
  });

  test("is true with -w", () => {
    expect(watchFromArgv(["node", "vp", "pack", "-w"])).toBe(true);
  });

  test("is false with neither", () => {
    expect(watchFromArgv(["node", "vp", "pack", "--watchful", "-W"])).toBe(false);
  });
});

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
    const config = modPack("hello", { watch: true, home });
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

  test("puts the slot back once, from the mod's own mod.json, after the first build", async () => {
    const home = herdrHomeWithMods();
    const modJson: ModJson = { place: "left", size: 240 };
    const modDir = modSource(modJson);
    const { ensureSlot, calls } = recordingEnsureSlot("slot line");
    const log = silencedLog();
    const config = modPack("hello", { watch: true, home, modDir, ensureSlot });
    expect(calls).toEqual([]);

    await runOnSuccess(config);
    await runOnSuccess(config);
    await runOnSuccess(config);

    expect(calls).toEqual([["hello", modJson, { home }]]);
    expect(log).toHaveBeenCalledWith("slot line");
  });

  test("retries the slot on the next build when mod.json can't be read", async () => {
    const home = herdrHomeWithMods();
    const modDir = tempDir();
    writeFile(modDir, "assets/mod.json", "{ not json");
    const { ensureSlot, calls } = recordingEnsureSlot("slot line");
    silencedLog();
    const config = modPack("hello", { watch: true, home, modDir, ensureSlot });

    await expect(runOnSuccess(config)).rejects.toThrow();
    expect(calls).toEqual([]);

    const modJson: ModJson = { place: "right" };
    writeFile(modDir, "assets/mod.json", JSON.stringify(modJson));
    await runOnSuccess(config);
    await runOnSuccess(config);

    expect(calls).toEqual([["hello", modJson, { home }]]);
  });
});
