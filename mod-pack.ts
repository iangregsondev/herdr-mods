// Shared `vp pack` settings for every mod in apps/.
// A mod builds from apps/<name>/src/main.ts into the repo-root mods/<name>/,
// the folder Herdr users install. That output is committed.
//
// Watch mode (`vp run <name>#dev`) builds into the Herdr app instead:
// <app home>/mods/<name>/, so every save reloads the mod in the window.
// Herdr hot-reloads only real files in its own mods/ folder (a symlink to
// mods/<name>/ does not reload), so the build has to land there.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { UserConfig } from "vite-plus";
import { DEV_MARKER, ensureSlot, herdrHome, type Place } from "./scripts/herdr-slots.ts";

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

const isWatch = process.argv.includes("--watch") || process.argv.includes("-w");

type EnsureSlot = (
  mod: string,
  modJson: { place?: Place; size?: number },
  options: { home: string },
) => string;

export interface ModPackOptions {
  /** Build into the Herdr app (watch mode). Defaults to `--watch` or `-w` in argv. */
  watch?: boolean;
  /** The Herdr app home a watch build goes into. Defaults to `herdrHome()`. */
  home?: string;
  /** The mod's source folder, where `assets/mod.json` lives. Defaults to the working directory. */
  modDir?: string;
  /** Puts the mod's slot back in the shown layout after the first watch build. */
  ensureSlot?: EnsureSlot;
}

/** The mod's folder in the Herdr app, claimed for a dev build. */
function devOutDir(name: string, home: string): string {
  const mods = join(home, "mods");
  const dir = join(mods, name);
  if (!existsSync(mods)) {
    throw new Error(`mod-pack: no Herdr app at ${home} (set HERDR_APP_HOME?)`);
  }
  if (existsSync(dir) && !existsSync(join(dir, DEV_MARKER))) {
    throw new Error(
      `mod-pack: ${dir} is an installed mod, not a dev build; not overwriting it. ` +
        `Remove or rename it in Herdr first.`,
    );
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, DEV_MARKER),
    `Dev build of "${name}" from herdr-mods (vp run ${name}#dev).\n` +
      `Remove it with: vp run dev:remove ${name}\n`,
  );
  return dir;
}

/**
 * After the first good build of a watch, puts the mod's slot back in the shown
 * layout if it has none. Herdr only docks a mod the first time it ever sees it,
 * so a dev build that was removed and comes back would otherwise not show.
 */
function slotOnFirstBuild(
  name: string,
  { home, modDir, slot }: { home: string; modDir: string; slot: EnsureSlot },
): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    // The mod's own committed mod.json (vp pack runs in apps/<name>/), trusted unchecked.
    // An unknown `place` gets a "by hand" message from ensureSlot, not a guess.
    const modJson = JSON.parse(readFileSync(resolve(modDir, "assets/mod.json"), "utf8")) as {
      place?: Place;
      size?: number;
    };
    console.log(slot(name, modJson, { home }));
  };
}

export function modPack(
  name: string,
  {
    watch = isWatch,
    home = herdrHome(),
    modDir = process.cwd(),
    ensureSlot: slot = ensureSlot,
  }: ModPackOptions = {},
): PackConfig {
  const outDir = watch ? devOutDir(name, home) : `../../mods/${name}`;
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
    // Never clean the Herdr app's folder: it holds the marker and files Herdr writes.
    clean: !watch,
    deps: { neverBundle: HERDR_BUILTINS },
    copy: [{ from: "assets/*", to: outDir }],
    ...(watch ? { onSuccess: slotOnFirstBuild(name, { home, modDir, slot }) } : {}),
  };
}
