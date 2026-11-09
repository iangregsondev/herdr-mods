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
import { DEV_MARKER, ensureSlot, herdrHome, type ModJson } from "./scripts/herdr-slots.ts";

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

/** Puts `mod`'s slot back in the shown layout; returns a line for the person. */
export type EnsureSlot = (mod: string, modJson: ModJson, options: { home: string }) => string;

export interface ModPackOptions {
  /** Build into the Herdr app (watch mode). Defaults to `--watch` or `-w` in argv. */
  watch?: boolean;
  /** The Herdr app home a watch build goes into. Defaults to `herdrHome()`. */
  home?: string;
  /**
   * The folder whose `assets/mod.json` the first watch build reads. Only that file is
   * read from it: the entry, the copied assets and the out dir stay relative to the
   * working directory. Defaults to the working directory.
   */
  modDir?: string;
  /**
   * Puts the mod's slot back in the shown layout after the first watch build.
   * Defaults to `ensureSlot` from `scripts/herdr-slots.ts`.
   */
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
 * A build whose mod.json can't be read throws and the next build tries again;
 * once `slot` has returned, later builds do nothing.
 */
function slotOnFirstBuild(
  name: string,
  { home, modDir, slot }: { home: string; modDir: string; slot: EnsureSlot },
): () => void {
  let done = false;
  return () => {
    if (done) return;
    // `modDir/assets/mod.json` is the mod's own committed file, trusted unchecked.
    // An unknown `place` gets a "by hand" message from ensureSlot, not a guess.
    const modJson = JSON.parse(readFileSync(resolve(modDir, "assets/mod.json"), "utf8")) as ModJson;
    const line = slot(name, modJson, { home });
    done = true;
    console.log(line);
  };
}

export function modPack(
  name: string,
  {
    watch = watchFromArgv(process.argv),
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
