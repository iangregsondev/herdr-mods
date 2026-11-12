import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, onTestFinished, test, vi } from "vite-plus/test";
import {
  type EnsureSlot,
  modPack as modPackConfig,
  type ModPackOptions,
  watchFromArgv,
  watchStarted,
} from "../mod-pack.ts";
import { describeDevTarget, DevTarget } from "./dev-config.ts";
import { DEV_MARKER, hasSlot, type ModJson } from "./herdr-slots.ts";
import {
  fakeHerdrHost,
  fakeLoggingBin,
  git,
  loggedLines,
  readLayout,
  slot,
  tempDir,
  writeFile,
} from "./test-support.ts";

type PackConfig = ReturnType<typeof modPackConfig>;
type SinglePack = Exclude<PackConfig, readonly unknown[]>;

/** An `ensureSlot` that fails the test if called: no test reaches the real Herdr app. */
const unexpectedEnsureSlot: EnsureSlot = (mod) => {
  throw new Error(`ensureSlot called for ${mod} in a test that gave it no fake`);
};

/**
 * modPack's config, narrowed from vp's "one config or a list" type to the one it returns.
 * The test waits, when it finishes, for the work the watch started in the background,
 * so nothing still writes into its temp folders as they are removed. The finish
 * callbacks run newest first, so this runs before those folders go.
 */
function startedPack(name: string, options: ModPackOptions): SinglePack {
  const config = modPackConfig(name, options);
  onTestFinished(() => watchStarted(config));
  if (Array.isArray(config)) throw new Error("modPack returned a list of configs");
  return config;
}

/** `startedPack`, with `ensureSlot` defaulting to `unexpectedEnsureSlot`. */
function modPack(name: string, options: ModPackOptions = {}): SinglePack {
  return startedPack(name, {
    ensureSlot: unexpectedEnsureSlot,
    typesDir: join(tempDir(), "types"),
    ...options,
  });
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

/** Silences console.error for the current test and returns the spy; restored when it finishes. */
function silencedError() {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => error.mockRestore());
  return error;
}

/** A temp Herdr home with an empty mods/ folder. */
function herdrHomeWithMods(): string {
  const home = tempDir();
  mkdirSync(join(home, "mods"));
  return home;
}

/**
 * Points the dev config at a `local` target whose Herdr home is `home`, for the
 * current test, and returns that target.
 */
function useLocalTarget(home: string): DevTarget {
  const config = writeFile(tempDir(), "herdr-dev.json", JSON.stringify({ target: "local" }));
  vi.stubEnv("HERDR_DEV_CONFIG", config);
  vi.stubEnv("HERDR_APP_HOME", home);
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  return DevTarget.Local({ herdrHome: home, file: config, found: true });
}

/** A temp Herdr home with an empty mods/ folder, made the local dev target. */
function localHerdrHome(): string {
  const home = herdrHomeWithMods();
  useLocalTarget(home);
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
  const config = () => modPack("hello", { watch: false });

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
    const home = localHerdrHome();
    modPack("hello", { watch: false });
    expect(readdirSync(join(home, "mods"))).toEqual([]);
  });
});

describe("modPack, watch mode", () => {
  test("prints the dev target line on start", () => {
    const target = useLocalTarget(herdrHomeWithMods());
    const log = silencedLog();
    modPack("hello", { watch: true });
    expect(log).toHaveBeenCalledWith(describeDevTarget(target));
  });

  test("builds into <home>/mods/<name> and marks it as a dev build", () => {
    const home = localHerdrHome();
    const config = modPack("hello", { watch: true });
    const dir = join(home, "mods", "hello");
    expect(config.outDir).toBe(dir);
    expect(existsSync(join(dir, DEV_MARKER))).toBe(true);
    expect(config.copy).toEqual([{ from: "assets/*", to: dir }]);
  });

  test("never cleans the out dir", () => {
    const config = (localHerdrHome(), modPack("hello", { watch: true }));
    expect(config.clean).toBe(false);
  });

  test("throws, naming the home, when the home has no mods/ folder", () => {
    const home = tempDir();
    useLocalTarget(home);
    expect(() => modPack("hello", { watch: true })).toThrow(home);
    expect(existsSync(join(home, "mods"))).toBe(false);
  });

  test("refuses an installed mod folder and leaves it untouched", () => {
    const home = localHerdrHome();
    const dir = join(home, "mods", "hello");
    writeFile(dir, "main.js", "installed");
    expect(() => modPack("hello", { watch: true })).toThrow(/installed mod/);
    expect(readdirSync(dir)).toEqual(["main.js"]);
    expect(readFileSync(join(dir, "main.js"), "utf8")).toBe("installed");
  });

  test("throws, naming what it couldn't do, when the dev marker can't be written", () => {
    const home = localHerdrHome();
    writeFile(home, `mods/hello/${DEV_MARKER}/inner`, "");
    expect(() => modPack("hello", { watch: true })).toThrow(
      `mod-pack: couldn't write ${join(home, "mods", "hello", DEV_MARKER)}`,
    );
  });

  test("reuses an existing dev build, keeping its files", () => {
    const home = localHerdrHome();
    const dir = join(home, "mods", "hello");
    writeFile(dir, DEV_MARKER, "old marker");
    writeFile(dir, "main.js", "previous build");
    const config = modPack("hello", { watch: true });
    expect(config.outDir).toBe(dir);
    expect(readFileSync(join(dir, "main.js"), "utf8")).toBe("previous build");
  });

  test("puts the slot back once, from the mod's own mod.json, after the first build", async () => {
    const target = useLocalTarget(herdrHomeWithMods());
    const modJson: ModJson = { place: "left", size: 240 };
    const modDir = modSource(modJson);
    const { ensureSlot, calls } = recordingEnsureSlot("slot line");
    const log = silencedLog();
    const config = modPack("hello", { watch: true, modDir, ensureSlot });
    expect(calls).toEqual([]);

    await runOnSuccess(config);
    await runOnSuccess(config);
    await runOnSuccess(config);

    expect(calls).toEqual([["hello", modJson, target]]);
    expect(log).toHaveBeenCalledWith("slot line");
  });

  test("retries the slot on the next build when mod.json can't be read", async () => {
    const target = useLocalTarget(herdrHomeWithMods());
    const modDir = tempDir();
    writeFile(modDir, "assets/mod.json", "{ not json");
    const { ensureSlot, calls } = recordingEnsureSlot("slot line");
    silencedLog();
    const config = modPack("hello", { watch: true, modDir, ensureSlot });

    await expect(runOnSuccess(config)).rejects.toThrow();
    expect(calls).toEqual([]);

    const modJson: ModJson = { place: "right" };
    writeFile(modDir, "assets/mod.json", JSON.stringify(modJson));
    await runOnSuccess(config);
    await runOnSuccess(config);

    expect(calls).toEqual([["hello", modJson, target]]);
  });
});

/** The repo root, where the watch's staging folder lives (under node_modules). */
const REPO_ROOT = resolve(import.meta.dirname, "..");

/**
 * A mod name no other test uses, whose staging folder in the repo is removed
 * when the current test finishes.
 */
function stagedModName(): string {
  const name = `test-${randomUUID().slice(0, 8)}`;
  onTestFinished(() => rmSync(stagingFolder(name), { recursive: true, force: true }));
  return name;
}

/** Where a remote watch stages `name`'s build. */
const stagingFolder = (name: string): string => join(REPO_ROOT, "node_modules", ".herdr-dev", name);

/**
 * A fake Herdr host with a `mods/` folder, made the remote dev target for the
 * current test, and a local Herdr home (HERDR_APP_HOME) that a remote watch must
 * never touch.
 */
function remoteHerdrHost(options: { readonly unreachable?: boolean } = {}) {
  const fake = fakeHerdrHost(options);
  mkdirSync(join(fake.home, "mods"), { recursive: true });
  const localHome = herdrHomeWithMods();
  vi.stubEnv("HERDR_DEV_CONFIG", fake.config);
  vi.stubEnv("HERDR_APP_HOME", localHome);
  return { ...fake, localHome };
}

/** Herdr's type files, written into the Herdr home `home`. */
const typeFiles = ["herdr.d.ts", "gpui-kit.d.ts"] as const;
function writeTypeFiles(home: string): void {
  typeFiles.forEach((file) => writeFile(home, file, `// ${file}\n`));
}

/** Where the link at `path` points, or "not a link". */
const linkTarget = (path: string): string =>
  lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true
    ? readlinkSync(path)
    : "not a link";

/** What the file at `path` holds, or "missing". */
const contentOf = (path: string): string =>
  existsSync(path) ? readFileSync(path, "utf8") : "missing";

describe("modPack, Herdr types on start", () => {
  test("a local watch links Herdr's type files into the types folder", () => {
    const home = localHerdrHome();
    writeTypeFiles(home);
    const typesDir = join(tempDir(), "types");
    silencedLog();
    modPack("hello", { watch: true, typesDir });
    expect(typeFiles.map((file) => linkTarget(join(typesDir, file)))).toEqual(
      typeFiles.map((file) => join(home, file)),
    );
  });

  test("a remote watch copies Herdr's type files from the host into the types folder", async () => {
    const host = remoteHerdrHost();
    writeTypeFiles(host.home);
    const typesDir = join(tempDir(), "types");
    silencedLog();
    await watchStarted(modPack(stagedModName(), { watch: true, typesDir }));
    expect(typeFiles.map((file) => contentOf(join(typesDir, file)))).toEqual(
      typeFiles.map((file) => `// ${file}\n`),
    );
  });

  test("a local watch prints a types refresh that throws, and still starts", () => {
    const home = localHerdrHome();
    writeTypeFiles(home);
    const log = silencedLog();
    // Printing the types line throws, as writing to a closed stdout does.
    log.mockImplementation((line: unknown) => {
      if (String(line).startsWith("herdr-types:")) throw new Error("stdout closed");
    });
    const error = silencedError();
    expect(modPack("hello", { watch: true }).outDir).toBe(join(home, "mods", "hello"));
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/types.*stdout closed/));
  });

  test("a remote watch prints a types refresh that throws, and its start still resolves", async () => {
    const host = remoteHerdrHost();
    writeTypeFiles(host.home);
    const log = silencedLog();
    // Printing the types line throws, as writing to a closed stdout does.
    log.mockImplementation((line: unknown) => {
      if (String(line).startsWith("herdr-types:")) throw new Error("stdout closed");
    });
    const error = silencedError();
    const config = modPack(stagedModName(), { watch: true });
    await expect(watchStarted(config)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/types.*stdout closed/));
  });

  test("a watch with no type files on the host says so and still starts", async () => {
    remoteHerdrHost();
    const error = silencedError();
    silencedLog();
    const name = stagedModName();
    const config = modPack(name, { watch: true });
    expect(config.outDir).toBe(stagingFolder(name));
    await watchStarted(config);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^herdr-types: no Herdr app types/));
  });
});

describe("modPack, dev config", () => {
  test("a watch throws, naming the field, when the dev config is invalid", () => {
    const config = writeFile(
      tempDir(),
      "herdr-dev.json",
      JSON.stringify({ target: "remote", remote: { host: "herdr-host" } }),
    );
    vi.stubEnv("HERDR_DEV_CONFIG", config);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    expect(() => modPack("hello", { watch: true })).toThrow(`${config}: remote.user`);
  });
});

describe("modPack, local watch slot step", () => {
  test("throws at once, not as a rejected promise, when mod.json can't be read", () => {
    useLocalTarget(herdrHomeWithMods());
    const modDir = tempDir();
    writeFile(modDir, "assets/mod.json", "{ not json");
    silencedLog();
    const { onSuccess } = modPack("hello", { watch: true, modDir });
    if (typeof onSuccess !== "function") throw new Error("no onSuccess function");
    // vp pack passes its resolved config and an abort signal; the hook reads neither.
    const run = () => onSuccess(...([] as unknown as Parameters<typeof onSuccess>));
    expect(run).toThrow(SyntaxError);
  });
});

/**
 * modPack's watch config for `name`, with the real slot step (on the fake host)
 * and a mod.json of `modJson` (default: none of its fields).
 */
function remoteModPack(name: string, modJson: ModJson = {}): SinglePack {
  return startedPack(name, {
    watch: true,
    modDir: modSource(modJson),
    typesDir: join(tempDir(), "types"),
  });
}

describe("modPack, remote watch", () => {
  test("builds into the staging folder, never the repo's mods/ or a local Herdr home", () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    silencedLog();
    const config = modPack(name, { watch: true });
    expect(config.outDir).toBe(stagingFolder(name));
    expect(config.copy).toEqual([{ from: "assets/*", to: stagingFolder(name) }]);
    expect(config.clean).toBe(false);
    expect(existsSync(join(REPO_ROOT, "mods", name))).toBe(false);
    expect(readdirSync(join(host.localHome, "mods"))).toEqual([]);
  });

  test("prints the dev target line on start", () => {
    const host = remoteHerdrHost();
    const log = silencedLog();
    modPack(stagedModName(), { watch: true });
    expect(log).toHaveBeenCalledWith(describeDevTarget(DevTarget.Remote(host.target)));
  });

  test("writes the dev marker into the staging folder, not yet on the host", () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    silencedLog();
    modPack(name, { watch: true });
    expect(existsSync(join(stagingFolder(name), DEV_MARKER))).toBe(true);
    expect(readdirSync(join(host.home, "mods"))).toEqual([]);
  });

  test("syncs the staging folder, marker and all, to the host after a good build", async () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    silencedLog();
    const config = remoteModPack(name);
    writeFile(stagingFolder(name), "main.js", "first build");

    await runOnSuccess(config);

    const dir = join(host.home, "mods", name);
    expect(existsSync(join(dir, DEV_MARKER))).toBe(true);
    expect(readFileSync(join(dir, "main.js"), "utf8")).toBe("first build");
  });

  test("refuses to sync over an installed mod on the host, and leaves it untouched", async () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    const dir = join(host.home, "mods", name);
    writeFile(dir, "main.js", "installed");
    silencedLog();
    const error = silencedError();
    const config = remoteModPack(name);
    writeFile(stagingFolder(name), "main.js", "dev build");

    await runOnSuccess(config);

    expect(readdirSync(dir)).toEqual(["main.js"]);
    expect(readFileSync(join(dir, "main.js"), "utf8")).toBe("installed");
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/installed mod, not a dev build/));
  });

  test("prints a failed sync, keeps going, and syncs again on the next build", async () => {
    const host = remoteHerdrHost();
    const reachablePath = process.env.PATH;
    fakeHerdrHost({ unreachable: true });
    const name = stagedModName();
    silencedLog();
    const error = silencedError();
    const config = remoteModPack(name);
    writeFile(stagingFolder(name), "main.js", "first build");

    await runOnSuccess(config);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Herdr host unreachable/));
    expect(existsSync(join(host.home, "mods", name))).toBe(false);

    vi.stubEnv("PATH", reachablePath);
    writeFile(stagingFolder(name), "main.js", "second build");
    await runOnSuccess(config);
    expect(readFileSync(join(host.home, "mods", name, "main.js"), "utf8")).toBe("second build");
  });

  test("prints a build whose sync throws, and still syncs the next build", async () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    const log = silencedLog();
    const error = silencedError();
    const config = remoteModPack(name);
    await watchStarted(config);
    // Printing the first "synced" line throws, as writing to a closed stdout does.
    log.mockImplementationOnce(() => {
      throw new Error("stdout closed");
    });
    writeFile(stagingFolder(name), "main.js", "first build");

    await runOnSuccess(config).catch(() => undefined);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/stdout closed/));

    writeFile(stagingFolder(name), "main.js", "second build");
    await runOnSuccess(config).catch(() => undefined);
    expect(readFileSync(join(host.home, "mods", name, "main.js"), "utf8")).toBe("second build");
  });

  test("adds the slot to the host's shown layout once, after the first good sync", async () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    const appLog = join(host.root, "herdr-app.log");
    fakeLoggingBin(host.appBin, "herdr-app", { log: appLog, output: '{"layout":"work"}' });
    const work = writeFile(
      host.home,
      "layouts/work.json",
      JSON.stringify({ type: "row", children: [slot("other")] }),
    );
    const log = silencedLog();
    const config = remoteModPack(name, { place: "left" });

    await runOnSuccess(config);
    await runOnSuccess(config);
    await runOnSuccess(config);

    expect(loggedLines(appLog)).toEqual(["status"]);
    const children = readLayout(work).children ?? [];
    expect(children.map((child) => child.content?.mod)).toEqual([name, "other"]);
    expect(log).toHaveBeenCalledWith(`herdr-slots: added ${name} to "work" (left).`);
  });

  test("prints a failed slot step, keeps going, and tries the slot again on the next build", async () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    fakeLoggingBin(host.appBin, "herdr-app", {
      log: join(host.root, "herdr-app.log"),
      output: '{"layout":"work"}',
    });
    const work = writeFile(
      host.home,
      "layouts/work.json",
      JSON.stringify({ type: "row", children: [] }),
    );
    const modDir = tempDir();
    writeFile(modDir, "assets/mod.json", "{ not json");
    silencedLog();
    const error = silencedError();
    const config = modPack(name, { watch: true, modDir, ensureSlot: undefined });

    await expect(runOnSuccess(config)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(`couldn't put ${name}'s slot back`));
    expect(readLayout(work).children).toEqual([]);

    writeFile(modDir, "assets/mod.json", "{}");
    await runOnSuccess(config);
    expect(hasSlot(readLayout(work), name)).toBe(true);
  });

  test("runs one build's sync and slot step at a time when builds overlap", async () => {
    const host = remoteHerdrHost();
    const name = stagedModName();
    const appLog = join(host.root, "herdr-app.log");
    fakeLoggingBin(host.appBin, "herdr-app", { log: appLog, output: '{"layout":"work"}' });
    const work = writeFile(
      host.home,
      "layouts/work.json",
      JSON.stringify({ type: "row", children: [] }),
    );
    silencedLog();
    const config = remoteModPack(name);

    await Promise.all([runOnSuccess(config), runOnSuccess(config)]);

    expect(loggedLines(appLog)).toEqual(["status"]);
    expect(readLayout(work).children?.map((child) => child.content?.mod)).toEqual([name]);
  });

  test("stages in a folder git ignores", () => {
    const name = stagedModName();
    const staged = join(stagingFolder(name), "main.js");
    expect(git(REPO_ROOT, ["check-ignore", "--no-index", staged]).trim()).toBe(staged);
  });
});
