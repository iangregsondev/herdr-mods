// Removes a mod's dev build from the Herdr app (made by `vp run <name>#dev`):
// its folder, <app home>/mods/<name>/, and its slots in your layouts, so the panel goes too.
// A folder without the dev marker is a real installed mod: it and its slots are left alone.
//
//   vp run dev:remove <name>
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DEV_MARKER, herdrHome, removeSlots } from "./herdr-slots.ts";

const name = process.argv[2];
if (!name || process.argv.length > 3 || name.includes("/") || name.startsWith(".")) {
  console.error("usage: vp run dev:remove <name>");
  process.exit(2);
}

const dir = join(herdrHome(), "mods", name);

if (existsSync(dir)) {
  if (!existsSync(join(dir, DEV_MARKER))) {
    console.error(`dev-remove: ${dir} is an installed mod, not a dev build; left alone`);
    process.exit(1);
  }
  rmSync(dir, { recursive: true });
  console.log(`dev-remove: removed ${dir}`);
} else {
  console.log(`dev-remove: no files at ${dir}`);
}

const layouts = removeSlots(name);
console.log(
  layouts.length > 0
    ? `dev-remove: removed the ${name} panel from ${layouts.map((l) => `"${l}"`).join(", ")}`
    : `dev-remove: no ${name} panel in your layouts`,
);
