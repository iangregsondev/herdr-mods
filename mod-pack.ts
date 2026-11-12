// Shared `vp pack` settings for every mod in apps/.
// A mod builds from apps/<name>/src/main.ts into the repo-root mods/<name>/,
// the folder Herdr users install. That output is committed.
//
// Watch mode (`vp run <name>#dev`) builds into the Herdr app instead:
// <app home>/mods/<name>/, so every save reloads the mod in the window.
// Herdr hot-reloads only real files in its own mods/ folder (a symlink to
// mods/<name>/ does not reload), so the build has to land there.
// Every read and write of the Herdr home goes through HerdrHost; the one file read
// here directly is the mod's own assets/mod.json, in the repo.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Effect, Result } from "effect";
import type { UserConfig } from "vite-plus";
import { type DevTarget, loadDevTarget } from "./scripts/dev-config.ts";
import { DEV_MARKER, HerdrHost, hostLayer, InstalledModInTheWay } from "./scripts/herdr-host.ts";
import { ensureSlotOnHost, type ModJson } from "./scripts/herdr-slots.ts";

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

/** The slot step on the dev target's Herdr host. Rejects when the host can't be used. */
const ensureSlotOnTarget: EnsureSlot = (mod, modJson, target) =>
  Effect.runPromise(ensureSlotOnHost(mod, modJson).pipe(Effect.provide(hostLayer(target))));

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
}

/**
 * Claims `mods/<name>/` on the Herdr host for a dev build: refuses an installed
 * mod there, and writes the dev marker (making the folder). Fails with
 * FileMissing when the host has no `mods/` folder.
 */
export const claimDevBuild = Effect.fn("claimDevBuild")(function* (name: string) {
  const host = yield* HerdrHost;
  yield* host.listDir("mods");
  if ((yield* host.modState(name)) === "Installed") {
    return yield* new InstalledModInTheWay({ path: host.location(`mods/${name}`) });
  }
  yield* host.writeFile(
    `mods/${name}/${DEV_MARKER}`,
    `Dev build of "${name}" from herdr-mods (vp run ${name}#dev).\n` +
      `Remove it with: vp run dev:remove ${name}\n`,
  );
});

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
        throw new Error(
          `mod-pack: ${error.path} is an installed mod, not a dev build; not overwriting it. ` +
            `Remove or rename it in Herdr first.`,
        );
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
 * once `slot` has returned, later builds do nothing.
 */
function slotOnFirstBuild(
  name: string,
  { target, modDir, slot }: { target: DevTarget; modDir: string; slot: EnsureSlot },
): () => Promise<void> {
  let done = false;
  return async () => {
    if (done) return;
    // `modDir/assets/mod.json` is the mod's own committed file, trusted unchecked.
    // An unknown `place` gets a "by hand" message from ensureSlot, not a guess.
    const modJson = JSON.parse(readFileSync(resolve(modDir, "assets/mod.json"), "utf8")) as ModJson;
    const line = await slot(name, modJson, target);
    done = true;
    console.log(line);
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

export function modPack(
  name: string,
  {
    watch = watchFromArgv(process.argv),
    modDir = process.cwd(),
    ensureSlot: slot = ensureSlotOnTarget,
  }: ModPackOptions = {},
): PackConfig {
  if (!watch) return packConfig(`../../mods/${name}`);
  const target = devTarget();
  return packConfig(
    devOutDir(name, target.herdrHome),
    slotOnFirstBuild(name, { target, modDir, slot }),
  );
}

/**
 * The pack settings for building into `outDir`. A watch build passes `onSuccess`,
 * run after each good build; the out dir is then never cleaned.
 */
function packConfig(outDir: string, onSuccess?: () => Promise<void>): PackConfig {
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
