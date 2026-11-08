// Shared `vp pack` settings for every mod in apps/.
// A mod builds from apps/<name>/src/main.ts into the repo-root mods/<name>/,
// the folder Herdr users install. That output is committed.
//
// Watch mode (`vp run <name>#dev`) builds into the Herdr app instead:
// <app home>/mods/<name>/, so every save reloads the mod in the window.
// Herdr hot-reloads only real files in its own mods/ folder (a symlink to
// mods/<name>/ does not reload), so the build has to land there.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UserConfig } from "vite-plus";

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

/**
 * Marks a folder in the Herdr app as a dev build from this repo. Hidden, so
 * Herdr ignores it. A folder without it is a real install and is never touched.
 */
export const DEV_MARKER = ".herdr-mods-dev";

const isWatch = process.argv.includes("--watch") || process.argv.includes("-w");

function herdrHome(): string {
  return process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app");
}

/** The mod's folder in the Herdr app, claimed for a dev build. */
function devOutDir(name: string): string {
  const mods = join(herdrHome(), "mods");
  const dir = join(mods, name);
  if (!existsSync(mods)) {
    throw new Error(`mod-pack: no Herdr app at ${herdrHome()} (set HERDR_APP_HOME?)`);
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
      `Remove it with: sh scripts/dev-remove.sh ${name}\n`,
  );
  return dir;
}

export function modPack(name: string): PackConfig {
  const outDir = isWatch ? devOutDir(name) : `../../mods/${name}`;
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
    clean: !isWatch,
    deps: { neverBundle: HERDR_BUILTINS },
    copy: [{ from: "assets/*", to: outDir }],
  };
}
