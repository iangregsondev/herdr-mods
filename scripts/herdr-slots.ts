// A mod shows in Herdr through a slot: a `block` node in a layout file
// (<app home>/layouts/<name>.json) whose content is { mod: "<name>" }.
// Herdr adds a slot only the first time it ever sees a mod, and remembers that
// in memory, so a dev build that comes back needs its slot put back by us.
// Layout files are live: Herdr applies an edit at once.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LayoutNode {
  id?: string;
  type?: string;
  content?: { mod?: string };
  size?: { px?: number; weight?: number };
  children?: LayoutNode[];
  [key: string]: unknown;
}

export type Place = "left" | "right" | "top" | "bottom" | "none";

/**
 * Marks a folder in the Herdr app as a dev build from this repo. Hidden, so
 * Herdr ignores it. A folder without it is a real install and is never touched.
 */
export const DEV_MARKER = ".herdr-mods-dev";

export function herdrHome(): string {
  return process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app");
}

/** True when any node in the tree is a slot for `mod`. */
export function hasSlot(node: LayoutNode, mod: string): boolean {
  if (node.content?.mod === mod) return true;
  return (node.children ?? []).some((child) => hasSlot(child, mod));
}

/** The tree without any slot for `mod`, and how many were removed. */
export function withoutSlots(node: LayoutNode, mod: string): { node: LayoutNode; removed: number } {
  if (!node.children) return { node, removed: 0 };
  let removed = 0;
  const children: LayoutNode[] = [];
  for (const child of node.children) {
    if (child.content?.mod === mod) {
      removed++;
      continue;
    }
    const inner = withoutSlots(child, mod);
    removed += inner.removed;
    children.push(inner.node);
  }
  return { node: { ...node, children }, removed };
}

/**
 * The tree with a slot for `mod` docked where Herdr would put it on first sight:
 * the end of a root row for "right", the start for "left". Returns null when it
 * can't place it that way (another place, or the root isn't a row), so the
 * caller can tell the person instead of guessing.
 */
export function withSlot(
  root: LayoutNode,
  mod: string,
  place: Place,
  sizePx: number | undefined,
): LayoutNode | null {
  if (place !== "left" && place !== "right") return null;
  if (root.type !== "row" || !root.children) return null;
  const slot: LayoutNode = {
    id: `b${randomUUID().replaceAll("-", "")}`,
    type: "block",
    content: { mod },
    ...(sizePx ? { size: { px: sizePx } } : {}),
  };
  const children = place === "right" ? [...root.children, slot] : [slot, ...root.children];
  return { ...root, children };
}

function readLayout(file: string): LayoutNode {
  // Herdr writes layout files; this script trusts their shape rather than parsing it.
  return JSON.parse(readFileSync(file, "utf8")) as LayoutNode;
}

function writeLayout(file: string, layout: LayoutNode): void {
  writeFileSync(file, `${JSON.stringify(layout, null, 2)}\n`);
}

/** Layouts that ship with Herdr: their structure can't be edited, only cloned. */
function shippedLayouts(home: string): Set<string> {
  try {
    // Only the keys are read, so a non-object can't add a layout: JSON `null` makes
    // Object.keys throw (caught below: an empty set), and a string, number or array
    // gives only index keys or none, never a "layout:" key.
    const installed = JSON.parse(readFileSync(join(home, "installed.json"), "utf8")) as object;
    return new Set(
      Object.keys(installed)
        .filter((key) => key.startsWith("layout:"))
        .map((key) => key.slice("layout:".length)),
    );
  } catch {
    return new Set();
  }
}

/**
 * The shown layout's name from `herdr-app status` JSON. Null unless the text is
 * a JSON object whose `layout` is a non-empty string.
 */
export function layoutFromStatus(text: string): string | null {
  try {
    const status: unknown = JSON.parse(text);
    if (typeof status !== "object" || status === null || !("layout" in status)) return null;
    const { layout } = status;
    return typeof layout === "string" && layout !== "" ? layout : null;
  } catch {
    return null;
  }
}

/** `herdr-app status` output; null when Herdr isn't running or the command fails. */
export function herdrStatus(): string | null {
  try {
    return execFileSync("herdr-app", ["status"], { encoding: "utf8" });
  } catch {
    return null;
  }
}

/** Removes every slot for `mod` from the person's own layouts. Returns the layouts changed. */
export function removeSlots(mod: string, home = herdrHome()): string[] {
  const dir = join(home, "layouts");
  if (!existsSync(dir)) return [];
  const shipped = shippedLayouts(home);
  const changed: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const name = file.slice(0, -".json".length);
    if (shipped.has(name)) continue;
    const path = join(dir, file);
    const { node, removed } = withoutSlots(readLayout(path), mod);
    if (removed > 0) {
      writeLayout(path, node);
      changed.push(name);
    }
  }
  return changed;
}

/**
 * Makes sure the shown layout has a slot for `mod`, adding one from its
 * mod.json `place` and `size` if not. Returns a line for the person.
 * `status` gives `herdr-app status` output (null: Herdr isn't running).
 */
export function ensureSlot(
  mod: string,
  modJson: { place?: Place; size?: number },
  {
    home = herdrHome(),
    status = herdrStatus,
  }: { home?: string; status?: () => string | null } = {},
): string {
  const text = status();
  const layout = text === null ? null : layoutFromStatus(text);
  if (!layout) return `herdr-slots: Herdr isn't running; open it to see ${mod}.`;
  if (shippedLayouts(home).has(layout)) {
    return `herdr-slots: "${layout}" ships with Herdr and can't take new slots; clone it, or add ${mod} by hand.`;
  }
  const path = join(home, "layouts", `${layout}.json`);
  if (!existsSync(path)) return `herdr-slots: no file for layout "${layout}"; add ${mod} by hand.`;
  const root = readLayout(path);
  if (hasSlot(root, mod)) return `herdr-slots: ${mod} already has a slot in "${layout}".`;
  const next = withSlot(root, mod, modJson.place ?? "right", modJson.size);
  if (!next) {
    return `herdr-slots: can't dock ${mod} at "${modJson.place}" automatically; add it to "${layout}" by hand.`;
  }
  writeLayout(path, next);
  return `herdr-slots: added ${mod} to "${layout}" (${modJson.place ?? "right"}).`;
}
