// Shared `vp pack` settings for every mod in apps/.
// A mod builds from apps/<name>/src/main.ts into the repo-root mods/<name>/,
// the folder Herdr users install. That output is committed.
//
// Watch mode (`vp run <name>#dev`) builds into the Herdr app instead, on the dev
// target (herdr-dev.json; see scripts/dev-config.ts), so every save reloads the mod
// in the window. Herdr hot-reloads only real files in its own mods/ folder (a symlink
// to mods/<name>/ does not reload), so the build has to land there.
// - local: builds straight into <app home>/mods/<name>/.
// - remote: builds into node_modules/.herdr-dev/<name>/ (git-ignored, never cleaned),
//   then rsyncs that into the Herdr host's mods/<name>/ after each good build.
// When it starts, a watch prints its dev target and puts Herdr's type files from
// that target into .herdr-types/ (scripts/herdr-types.ts).
// Every read and write of the Herdr home goes through HerdrHost; the one file read
// here directly is the mod's own assets/mod.json, in the repo.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Predicate, Result } from "effect";
import type { UserConfig } from "vite-plus";
import { describeDevTarget, type DevTarget, loadDevTarget } from "./scripts/dev-config.ts";
import {
  DEV_MARKER,
  type FileMissing,
  HerdrHost,
  type HostUnreachable,
  hostLayer,
  InstalledModInTheWay,
  type TransportError,
} from "./scripts/herdr-host.ts";
import { ensureSlot, ensureSlotOnHost, type ModJson } from "./scripts/herdr-slots.ts";
import { refreshHerdrTypes, TYPES_DIR, type TypesResult } from "./scripts/herdr-types.ts";

type PackConfig = NonNullable<UserConfig["pack"]>;

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

/** Puts `mod`'s slot back in the dev target's shown layout; gives a line for the person. */
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
    ? ensureSlot(mod, modJson, { home: target.herdrHome })
    : Effect.runPromise(ensureSlotOnHost(mod, modJson).pipe(Effect.provide(hostLayer(target))));

export interface ModPackOptions {
  /** Build into the Herdr app (watch mode). Defaults to `--watch` or `-w` in argv. */
  watch?: boolean;
  /**
   * The folder whose `assets/mod.json` the first watch build reads. Only that file is
   * read from it: the entry, the copied assets and the out dir stay relative to the
   * working directory. Defaults to the working directory.
   */
  modDir?: string;
  /**
   * Puts the mod's slot back in the shown layout after the first watch build.
   * Defaults to `ensureSlotOnHost` from `scripts/herdr-slots.ts`, on the dev target.
   */
  ensureSlot?: EnsureSlot;
  /**
   * Where a watch puts Herdr's type files when it starts (see `scripts/herdr-types.ts`).
   * Defaults to the repo's `.herdr-types/`.
   */
  typesDir?: string;
}

/** What the dev marker says, for anyone who finds it in a mod's folder. */
const markerText = (name: string): string =>
  `Dev build of "${name}" from herdr-mods (vp run ${name}#dev).\n` +
  `Remove it with: vp run dev:remove ${name}\n`;

/**
 * Checks that `mods/<name>/` on the Herdr host can take a dev build: fails with
 * InstalledModInTheWay when an installed mod is there, and with FileMissing when
 * the host has no `mods/` folder.
 */
export const guardDevBuild = Effect.fn("guardDevBuild")(function* (name: string) {
  const host = yield* HerdrHost;
  yield* host.listDir("mods");
  if ((yield* host.modState(name)) === "Installed") {
    return yield* new InstalledModInTheWay({ path: host.location(`mods/${name}`) });
  }
});

/**
 * Claims `mods/<name>/` on the Herdr host for a dev build: refuses an installed
 * mod there (see `guardDevBuild`), and writes the dev marker (making the folder).
 */
export const claimDevBuild = Effect.fn("claimDevBuild")(function* (name: string) {
  yield* guardDevBuild(name);
  const host = yield* HerdrHost;
  yield* host.writeFile(`mods/${name}/${DEV_MARKER}`, markerText(name));
});

/** The repo root: this file's folder. */
const REPO_ROOT = fileURLToPath(new URL(".", import.meta.url));

/** Where remote watches stage their builds: under node_modules, so git-ignored. */
const STAGING_ROOT = join(REPO_ROOT, "node_modules", ".herdr-dev");

/** Where a remote watch builds `name` before syncing it to the Herdr host. */
export const stagingFolder = (name: string): string => join(STAGING_ROOT, name);

/**
 * The staging folder for `name`, with the dev marker written in it, so the
 * first sync carries the marker to the Herdr host. It is never cleaned, so it
 * survives between runs. Throws, naming the file, when the marker can't be written.
 */
function stageDevBuild(name: string): string {
  // The staging folder is on this machine, so the Local layer writes it.
  const written = Effect.runSync(
    Effect.result(
      HerdrHost.use((host) => host.writeFile(`${name}/${DEV_MARKER}`, markerText(name))).pipe(
        Effect.provide(HerdrHost.local(STAGING_ROOT)),
      ),
    ),
  );
  if (Result.isFailure(written)) {
    const error = written.failure;
    throw new Error(
      error._tag === "TransportError" ? `mod-pack: couldn't ${error.operation}` : error.message,
      { cause: error },
    );
  }
  return stagingFolder(name);
}

/** Says the watch won't overwrite the installed mod at `path`. */
const installedModLine = (path: string): string =>
  `mod-pack: ${path} is an installed mod, not a dev build; not overwriting it. ` +
  `Remove or rename it in Herdr first.`;

/** The mod's folder in the Herdr app on this machine, claimed for a dev build. */
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
  return join(home, "mods", name);
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
    const line = slot(name, modJson, target);
    return Predicate.isString(line) ? finish(line) : line.then(finish);
  };
}

/** A failure's cause as text: what a failed command said, else its message. */
const causeText = (cause: unknown): string =>
  Predicate.hasProperty(cause, "stderr") && Predicate.isString(cause.stderr)
    ? cause.stderr.trim()
    : Predicate.hasProperty(cause, "message")
      ? String(cause.message)
      : String(cause);

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
 * host's `mods/<name>/`, then runs `slotStep` (which does its work once). Before
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
    yield* host.syncInto(staging, `mods/${name}`);
    return host.location(`mods/${name}`);
  }).pipe(Effect.provide(hostLayer(target)));
  const syncOnce = async (): Promise<void> => {
    const synced = await Effect.runPromise(Effect.result(sync));
    if (Result.isFailure(synced)) {
      console.error(syncProblem(synced.failure));
      return;
    }
    console.log(`mod-pack: synced ${name} to ${synced.success}`);
    // A failed slot step is printed, not thrown: vp pack doesn't wait on onSuccess,
    // so a rejection here would reach no one. The step does its work once, so the
    // next build tries it again until it has.
    await Promise.resolve()
      .then(slotStep)
      .catch((cause: unknown) =>
        console.error(
          `mod-pack: couldn't put ${name}'s slot back (${causeText(cause)}); the next build tries again.`,
        ),
      );
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
          `mod-pack: couldn't sync ${name} (${causeText(cause)}); the next build tries again.`,
        ),
      );
    return previous;
  };
}

/** The dev target from herdr-dev.json (or HERDR_DEV_CONFIG); throws, naming the problem. */
function devTarget(): DevTarget {
  const loaded = Effect.runSync(Effect.result(loadDevTarget()));
  if (Result.isSuccess(loaded)) return loaded.success;
  const error = loaded.failure;
  switch (error._tag) {
    case "DevConfigInvalid":
      throw new Error(`mod-pack: ${error.file}: ${error.field}: ${error.message}`);
    case "DevConfigUnreadable":
      throw new Error(`mod-pack: couldn't read ${error.file}`, { cause: error.cause });
  }
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

/** The background work each watch config's start began, keyed by the config. */
const startedWork = new WeakMap<PackConfig, Promise<void>>();

/**
 * Resolves when the work `config`'s watch started in the background (the types
 * refresh over SSH) is done; at once for a config with none. The watch never
 * waits on it, but a caller that must not outlive it, such as a test, can.
 */
export const watchStarted = (config: PackConfig): Promise<void> =>
  startedWork.get(config) ?? Promise.resolve();

export function modPack(
  name: string,
  {
    watch = watchFromArgv(process.argv),
    modDir = process.cwd(),
    ensureSlot: slot = ensureSlotOnTarget,
    typesDir = TYPES_DIR,
  }: ModPackOptions = {},
): PackConfig {
  if (!watch) return packConfig(`../../mods/${name}`);
  const target = devTarget();
  const started = startWatch(target, typesDir);
  const config =
    target._tag === "Remote"
      ? remoteWatchConfig(name, { target, modDir, slot })
      : packConfig(
          devOutDir(name, target.herdrHome),
          slotOnFirstBuild(name, { target, modDir, slot }),
        );
  startedWork.set(config, started);
  return config;
}

/** The watch config for a remote dev target: stage here, sync to the host. */
function remoteWatchConfig(
  name: string,
  { target, modDir, slot }: { target: DevTarget; modDir: string; slot: EnsureSlot },
): PackConfig {
  const staging = stageDevBuild(name);
  const slotStep = slotOnFirstBuild(name, { target, modDir, slot });
  return packConfig(staging, syncAfterEachBuild(name, { staging, target, slotStep }));
}

/**
 * The pack settings for building into `outDir`. A watch build passes `onSuccess`,
 * run after each good build; the out dir is then never cleaned.
 */
function packConfig(outDir: string, onSuccess?: () => void | Promise<void>): PackConfig {
  const watch = onSuccess !== undefined;
  return {
    entry: { main: "src/main.ts" },
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
    ...(watch ? { onSuccess } : {}),
  };
}
