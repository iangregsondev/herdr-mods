// Shared `vp pack` settings for every mod in apps/.
// A mod builds from apps/<name>/src/main.ts into the repo-root mods/<mod id>/,
// the folder Herdr users install. That output is committed.
// The mod id is the namespace, a hyphen and the short name (docs/adr/0002):
// apps/worktrunk/ installs as iangregsondev-worktrunk. The source, package names and dev
// commands keep the short name; only the installed folders carry the id.
//
// Watch mode (`vp run <name>#dev`) builds into the Herdr app instead, on the dev
// target (herdr-dev.json; see scripts/dev-config.ts), so every save reloads the mod
// in the window. Herdr hot-reloads only real files in its own mods/ folder (a symlink
// to mods/<mod id>/ does not reload), so the build has to land there.
// - local: builds straight into <app home>/mods/<mod id>/.
// - remote: builds into node_modules/.herdr-dev/<mod id>/ (git-ignored, never cleaned),
//   then rsyncs that into the Herdr host's mods/<mod id>/ after each good build.
// When it starts, a watch prints its dev target and puts Herdr's type files from
// that target into .herdr-types/ (scripts/herdr-types.ts).
// Every build stamps the copied RECIPE.md with the mod version and a changelog link
// (scripts/recipe-stamp.ts); the source recipe stays unstamped.
// Every read and write of the Herdr home goes through HerdrHost, except the build
// output itself: vp pack writes it into the out dir, and the stamp edits the copied
// RECIPE.md there in place. The other files read here directly are the mod's own
// package.json and assets/mod.json, in the repo.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Predicate, Result } from "effect";
import type { UserConfig } from "vite-plus";
import {
  describeDevTarget,
  devConfigProblem,
  type DevTarget,
  loadDevTarget,
} from "./scripts/dev-config.ts";
import {
  causeText,
  DEV_MARKER,
  type FileMissing,
  HerdrHost,
  type HostUnreachable,
  hostLayer,
  InstalledModInTheWay,
  type TransportError,
} from "./scripts/herdr-host.ts";
import { ensureSlot, ensureSlotOnHost, type ModJson } from "./scripts/herdr-slots.ts";
import { readModPackage } from "./scripts/mod-folders.ts";
import { stampRecipe } from "./scripts/recipe-stamp.ts";
import { refreshHerdrTypes, TYPES_DIR, type TypesResult } from "./scripts/herdr-types.ts";

type PackConfig = NonNullable<UserConfig["pack"]>;

/**
 * The namespace every mod from this repo is installed under. The separator is a
 * hyphen, not a dot: Herdr writes commands as `<mod>.<command>`.
 */
export const NAMESPACE = "iangregsondev";

/** The installed id of the mod whose short name is `name`: `<namespace>-<name>`. */
export function modId(name: string): string {
  return `${NAMESPACE}-${name}`;
}

/** Modules the Herdr app provides at run time. Never bundle them. */
const HERDR_BUILTINS = [
  "herdr",
  "gpui",
  "gpui-kit",
  "gpui-base",
  "gpui-component",
  "gpui-shell",
  "gpui-fps",
  "buffer",
  "path",
  "url",
  "crypto",
  "fs",
  "fs/promises",
];

/** Whether `argv` asks for watch mode: `--watch` or `-w`, and nothing else. */
export function watchFromArgv(argv: readonly string[]): boolean {
  return argv.includes("--watch") || argv.includes("-w");
}

/** Puts `mod`'s slot back in the dev config's layout on the dev target; gives a line for the person. */
export type EnsureSlot = (
  mod: string,
  modJson: ModJson,
  target: DevTarget,
) => string | Promise<string>;

/**
 * The slot step on the dev target's Herdr host. On this machine it runs at once
 * and throws on failure, as the local watch always has; over SSH it gives a
 * promise, which rejects when the host can't be used.
 */
const ensureSlotOnTarget: EnsureSlot = (mod, modJson, target) =>
  target._tag === "Local"
    ? ensureSlot(mod, modJson, { home: target.herdrHome, layout: target.layout })
    : Effect.runPromise(
        ensureSlotOnHost(mod, modJson, target.layout).pipe(Effect.provide(hostLayer(target))),
      );

export interface ModPackOptions {
  /** Build into the Herdr app (watch mode). Defaults to `--watch` or `-w` in argv. */
  watch?: boolean;
  /**
   * The mod's folder: every build reads the version in its `package.json` (for the
   * recipe stamp), and the first watch build reads its `assets/mod.json`. Only those
   * files are read from it: the entry, the copied assets and the out dir stay relative
   * to the working directory. Defaults to the working directory.
   */
  modDir?: string;
  /**
   * Puts the mod's slot back in the dev config's layout after the first watch build.
   * Defaults to `ensureSlotOnHost` from `scripts/herdr-slots.ts`, on the dev target.
   */
  ensureSlot?: EnsureSlot;
  /**
   * Where a watch puts Herdr's type files when it starts (see `scripts/herdr-types.ts`).
   * Defaults to the repo's `.herdr-types/`.
   */
  typesDir?: string;
  /**
   * Where a remote watch stages its builds, one folder per mod, before syncing
   * them to the Herdr host. Defaults to the repo's `node_modules/.herdr-dev/`.
   */
  stagingRoot?: string;
  /**
   * Given, once a watch has started, the work it started in the background (the
   * types refresh over SSH), which resolves when that is done and never rejects.
   * The watch never waits on it; a caller that must not outlive it, such as a
   * test, can. Defaults to doing nothing.
   */
  onStarted?: (started: Promise<void>) => void;
}

/** What the dev marker says, for anyone who finds it in a mod's folder: its id, and its short-name commands. */
const markerText = (name: string): string =>
  `Dev build of "${modId(name)}" from herdr-mods (vp run ${name}#dev).\n` +
  `Remove it with: vp run dev:remove ${name}\n`;

/**
 * Checks that `mods/<mod id>/` on the Herdr host can take a dev build of the short
 * name `name`: fails with
 * InstalledModInTheWay when an installed mod is there, and with FileMissing when
 * the host has no `mods/` folder.
 */
export const guardDevBuild = Effect.fn("guardDevBuild")(function* (name: string) {
  const host = yield* HerdrHost;
  yield* host.listDir("mods");
  if ((yield* host.modState(modId(name))) === "Installed") {
    return yield* new InstalledModInTheWay({ path: host.location(`mods/${modId(name)}`) });
  }
});

/**
 * Claims `mods/<mod id>/` on the Herdr host for a dev build of the short name `name`: refuses an installed
 * mod there (see `guardDevBuild`), and writes the dev marker (making the folder).
 */
export const claimDevBuild = Effect.fn("claimDevBuild")(function* (name: string) {
  yield* guardDevBuild(name);
  const host = yield* HerdrHost;
  yield* host.writeFile(`mods/${modId(name)}/${DEV_MARKER}`, markerText(name));
});

/** The repo root: this file's folder. */
const REPO_ROOT = fileURLToPath(new URL(".", import.meta.url));

/** Where remote watches stage their builds by default: under node_modules, so git-ignored. */
export const STAGING_ROOT = join(REPO_ROOT, "node_modules", ".herdr-dev");

/** The staging folder `folder` (a mod id) under `stagingRoot`. */
export const stagingFolder = (folder: string, stagingRoot: string = STAGING_ROOT): string =>
  join(stagingRoot, folder);

/**
 * The staging folder for the short name `name` (named by its mod id), with the dev marker written in it, so the
 * first sync carries the marker to the Herdr host. It is never cleaned, so it
 * survives between runs. Throws, naming the file, when the marker can't be written.
 */
function stageDevBuild(name: string, stagingRoot: string): string {
  // The staging folder is on this machine, so the Local layer writes it.
  const written = Effect.runSync(
    Effect.result(
      HerdrHost.use((host) =>
        host.writeFile(`${modId(name)}/${DEV_MARKER}`, markerText(name)),
      ).pipe(Effect.provide(HerdrHost.local(stagingRoot))),
    ),
  );
  if (Result.isFailure(written)) {
    const error = written.failure;
    throw new Error(
      error._tag === "TransportError" ? `mod-pack: couldn't ${error.operation}` : error.message,
      { cause: error },
    );
  }
  return stagingFolder(modId(name), stagingRoot);
}

/** Says the watch won't overwrite the installed mod at `path`. */
const installedModLine = (path: string): string =>
  `mod-pack: ${path} is an installed mod, not a dev build; not overwriting it. ` +
  `Remove or rename it in Herdr first.`;

/** The mod's folder in the Herdr app on this machine, claimed for a dev build of the short name `name`. */
function devOutDir(name: string, home: string): string {
  const claimed = Effect.runSync(
    Effect.result(claimDevBuild(name).pipe(Effect.provide(HerdrHost.local(home)))),
  );
  if (Result.isFailure(claimed)) {
    const error = claimed.failure;
    switch (error._tag) {
      case "FileMissing":
        throw new Error(`mod-pack: no Herdr app at ${home} (set HERDR_APP_HOME?)`);
      case "InstalledModInTheWay":
        throw new Error(installedModLine(error.path));
      case "TransportError":
        throw new Error(`mod-pack: couldn't ${error.operation}`, { cause: error.cause });
    }
  }
  return join(home, "mods", modId(name));
}

/**
 * After the first good build of a watch, puts the mod's slot back in the shown
 * layout if it has none. Herdr only docks a mod the first time it ever sees it,
 * so a dev build that was removed and comes back would otherwise not show.
 * A build whose mod.json can't be read throws and the next build tries again;
 * once `slot` has given its line, later builds do nothing. It runs at once when
 * `slot` does, and gives a promise when `slot` does.
 */
function slotOnFirstBuild(
  name: string,
  { target, modDir, slot }: { target: DevTarget; modDir: string; slot: EnsureSlot },
): () => void | Promise<void> {
  let done = false;
  const finish = (line: string): void => {
    done = true;
    console.log(line);
  };
  return () => {
    if (done) return;
    // `modDir/assets/mod.json` is the mod's own committed file, trusted unchecked.
    // An unknown `place` gets a "by hand" message from ensureSlot, not a guess.
    const modJson = JSON.parse(readFileSync(resolve(modDir, "assets/mod.json"), "utf8")) as ModJson;
    const line = slot(modId(name), modJson, target);
    return Predicate.isString(line) ? finish(line) : line.then(finish);
  };
}

/** Why a remote watch didn't sync this build, as a line for the person. */
function syncProblem(
  error: FileMissing | InstalledModInTheWay | TransportError | HostUnreachable,
): string {
  switch (error._tag) {
    case "FileMissing":
      return `mod-pack: no Herdr app on the host (${error.path} is missing); not syncing.`;
    case "InstalledModInTheWay":
      return installedModLine(error.path);
    case "TransportError":
      return `mod-pack: couldn't ${error.operation} (${causeText(error.cause)}); the next build tries again.`;
    case "HostUnreachable":
      return `mod-pack: ${error.message}; the next build tries again.`;
  }
}

/**
 * After each good build of a remote watch, syncs the staging folder into the
 * host's `mods/<mod id>/`, then runs `slotStep` (which does its work once). Before
 * the first sync it checks there is no installed mod there. A failure is printed
 * and never thrown, so the watch keeps going and the next build tries again.
 */
function syncAfterEachBuild(
  name: string,
  {
    staging,
    target,
    slotStep,
  }: { staging: string; target: DevTarget; slotStep: () => void | Promise<void> },
): () => Promise<void> {
  let guarded = false;
  const sync = Effect.gen(function* () {
    if (!guarded) {
      yield* guardDevBuild(name);
      guarded = true;
    }
    const host = yield* HerdrHost;
    yield* host.syncInto(staging, `mods/${modId(name)}`);
    return host.location(`mods/${modId(name)}`);
  }).pipe(Effect.provide(hostLayer(target)));
  const syncOnce = async (): Promise<void> => {
    const synced = await Effect.runPromise(Effect.result(sync));
    if (Result.isFailure(synced)) {
      console.error(syncProblem(synced.failure));
      return;
    }
    console.log(`mod-pack: synced ${modId(name)} to ${synced.success}`);
    // A failed slot step is printed, not thrown: vp pack doesn't wait on onSuccess,
    // so a rejection here would reach no one. The step does its work once, so the
    // next build tries it again until it has. It may throw at once or reject;
    // awaiting it inside `try` catches both.
    try {
      await slotStep();
    } catch (cause) {
      console.error(
        `mod-pack: couldn't put ${modId(name)}'s slot back (${causeText(cause)}); the next build tries again.`,
      );
    }
  };
  // vp pack starts onSuccess without waiting for it, so builds can overlap: each
  // build's sync and slot step wait for the one before, and never interleave.
  // Anything syncOnce throws is printed here, so the queue never holds a rejected
  // promise and every later build still gets its own sync.
  let previous: Promise<void> = Promise.resolve();
  return () => {
    previous = previous
      .then(syncOnce)
      .catch((cause: unknown) =>
        console.error(
          `mod-pack: couldn't sync ${modId(name)} (${causeText(cause)}); the next build tries again.`,
        ),
      );
    return previous;
  };
}

/** The dev target from herdr-dev.json (or HERDR_DEV_CONFIG); throws, naming the problem. */
function devTarget(): DevTarget {
  const loaded = Effect.runSync(Effect.result(loadDevTarget()));
  if (Result.isSuccess(loaded)) return loaded.success;
  throw new Error(`mod-pack: ${devConfigProblem(loaded.failure)}`, { cause: loaded.failure });
}

/** Prints what the types refresh said, to stdout or stderr as it gave it. */
function printTypes(result: TypesResult): void {
  if (result.stdout !== "") console.log(result.stdout.trimEnd());
  if (result.stderr !== "") console.error(result.stderr.trimEnd());
}

/**
 * What a watch does once, when it starts: says where its builds go, and puts
 * Herdr's type files from the dev target into `typesDir`. The refresh never
 * fails (a problem is printed), so the watch always starts. On this machine it
 * is done before this returns; over SSH it runs alongside the first build, and
 * the promise given resolves when it is done.
 */
function startWatch(target: DevTarget, typesDir: string): Promise<void> {
  console.log(describeDevTarget(target));
  // A defect (printing included) is printed too, so the refresh never stops the
  // watch and never leaves a rejected promise that no one handles.
  const refresh = refreshHerdrTypes(target, typesDir).pipe(
    Effect.map(printTypes),
    Effect.catchDefect((defect) =>
      Effect.sync(() =>
        console.error(`mod-pack: couldn't refresh Herdr's types (${causeText(defect)})`),
      ),
    ),
  );
  if (target._tag === "Local") return Promise.resolve(Effect.runSync(refresh));
  return Effect.runPromise(refresh);
}

/** The `vp pack` settings for the mod whose short name (its apps/ folder) is `name`. */
export function modPack(
  name: string,
  {
    watch = watchFromArgv(process.argv),
    modDir = process.cwd(),
    ensureSlot: slot = ensureSlotOnTarget,
    typesDir = TYPES_DIR,
    stagingRoot = STAGING_ROOT,
    onStarted = () => undefined,
  }: ModPackOptions = {},
): PackConfig {
  if (!watch) return packConfig(name, modDir, `../../mods/${modId(name)}`);
  const target = devTarget();
  // Handed on before the out dir is claimed, so a caller can wait on the start
  // even when claiming it throws.
  onStarted(startWatch(target, typesDir));
  return target._tag === "Remote"
    ? remoteWatchConfig(name, { target, modDir, slot, stagingRoot })
    : packConfig(
        name,
        modDir,
        devOutDir(name, target.herdrHome),
        slotOnFirstBuild(name, { target, modDir, slot }),
      );
}

/** The watch config for a remote dev target: stage here, sync to the host. */
function remoteWatchConfig(
  name: string,
  {
    target,
    modDir,
    slot,
    stagingRoot,
  }: { target: DevTarget; modDir: string; slot: EnsureSlot; stagingRoot: string },
): PackConfig {
  const staging = stageDevBuild(name, stagingRoot);
  const slotStep = slotOnFirstBuild(name, { target, modDir, slot });
  return packConfig(name, modDir, staging, syncAfterEachBuild(name, { staging, target, slotStep }));
}

/** Where the changelog of the mod whose short name is `name` lives, on GitHub. */
const changelogUrl = (name: string): string =>
  `https://github.com/iangregsondev/herdr-mods/blob/main/apps/${name}/CHANGELOG.md`;

/**
 * Stamps the built `RECIPE.md` in `outDir` with the version in `modDir/package.json`
 * and the mod's changelog link (see `scripts/recipe-stamp.ts`). Throws, naming the
 * file, when the package.json has no name and version, so the build fails and the
 * recipe is left unstamped.
 */
function stampBuiltRecipe(name: string, modDir: string, outDir: string): void {
  const read = Effect.runSync(Effect.result(readModPackage(resolve(modDir, "package.json"))));
  if (Result.isFailure(read)) {
    const { path, cause } = read.failure;
    throw new Error(`mod-pack: couldn't read ${path} (${causeText(cause)})`, { cause });
  }
  const { version } = read.success;
  const recipe = join(outDir, "RECIPE.md");
  writeFileSync(
    recipe,
    stampRecipe(readFileSync(recipe, "utf8"), { version, changelogUrl: changelogUrl(name) }),
  );
}

/**
 * The pack settings for building the short name `name` into `outDir`. A watch
 * build passes `onSuccess`, run after each good build; the out dir is then never cleaned.
 */
function packConfig(
  name: string,
  modDir: string,
  outDir: string,
  onSuccess?: () => void | Promise<void>,
): PackConfig {
  const watch = onSuccess !== undefined;
  return {
    entry: { main: "src/main.ts" },
    // The mod reads its own id as `__MOD_ID__` (declared in mod-env.d.ts), for its
    // shared-state keys, settings file and layout references, and the namespace as
    // `__NAMESPACE__`, for files shared by every mod from this repo.
    define: {
      __MOD_ID__: JSON.stringify(modId(name)),
      __NAMESPACE__: JSON.stringify(NAMESPACE),
    },
    outDir,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    fixedExtension: false,
    hash: false,
    dts: false,
    // Installers and users read every file, so keep the output readable.
    minify: false,
    // Never clean a watch build's folder: it holds the marker and files Herdr writes.
    clean: !watch,
    deps: { neverBundle: HERDR_BUILTINS },
    copy: [{ from: "assets/*", to: outDir }],
    // After vp pack has copied the assets, stamp the copied recipe (never the source).
    hooks: { "build:done": ({ options }) => stampBuiltRecipe(name, modDir, options.outDir) },
    ...(watch ? { onSuccess } : {}),
  };
}
