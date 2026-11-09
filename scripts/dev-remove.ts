// Removes a mod's dev build from the Herdr app (made by `vp run <name>#dev`):
// its folder, <app home>/mods/<name>/, and its slots in your layouts, so the panel goes too.
// A folder without the dev marker is a real installed mod: it and its slots are left alone.
//
//   vp run dev:remove <name>
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DEV_MARKER, herdrHome, removeSlots } from "./herdr-slots.ts";

export interface DevRemoveResult {
  /** The exit code: 2 for a usage error, 1 for an installed mod, 0 otherwise. */
  code: number;
  /** Lines for stdout. */
  out: string[];
  /** Lines for stderr. */
  err: string[];
}

/** Removes the dev build named in `args` from the Herdr app at `home`. */
export function devRemove(args: readonly string[], home: string): DevRemoveResult {
  const name = args[0];
  if (!name || args.length > 1 || name.includes("/") || name.startsWith(".")) {
    return { code: 2, out: [], err: ["usage: vp run dev:remove <name>"] };
  }

  const dir = join(home, "mods", name);

  if (existsSync(dir) && !existsSync(join(dir, DEV_MARKER))) {
    return {
      code: 1,
      out: [],
      err: [`dev-remove: ${dir} is an installed mod, not a dev build; left alone`],
    };
  }

  const hadFiles = existsSync(dir);
  if (hadFiles) rmSync(dir, { recursive: true });
  const files = hadFiles ? `dev-remove: removed ${dir}` : `dev-remove: no files at ${dir}`;

  const layouts = removeSlots(name, home);
  const panel =
    layouts.length > 0
      ? `dev-remove: removed the ${name} panel from ${layouts.map((l) => `"${l}"`).join(", ")}`
      : `dev-remove: no ${name} panel in your layouts`;

  return { code: 0, out: [files, panel], err: [] };
}

if (import.meta.main) {
  const result = devRemove(process.argv.slice(2), herdrHome());
  result.out.forEach((line) => console.log(line));
  result.err.forEach((line) => console.error(line));
  process.exitCode = result.code;
}
