// Builds my own Herdr layout from Herdr's current default layout, so I get my mods and
// Herdr's design together and keep Herdr's later improvements.
//
//   vp run herdr:sync
//
// Reads <app home>/layouts/main.json (Herdr's default) and writes:
//   <app home>/layouts/workbench.json     Herdr's default plus my additions
//   <app home>/<namespace>-sync.json      the layout and the Herdr version it was built from
// The worktrunk panel compares that record with the installed version and asks for a
// new sync when Herdr has moved on. Re-run it after every Herdr update.
//
// When the record names another layout (an earlier sync's, under an older name), that
// layout is removed, and if Herdr was showing it, Herdr switches to the new one first.
// A layout the record doesn't name is never removed. It never edits Herdr's own files,
// never switches layouts otherwise, and keeps none of Herdr's code in this repo: it
// reads the installed files on this machine each time.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { modId, NAMESPACE } from "../mod-pack.ts";
import {
  herdrHome,
  layoutFromStatus,
  shippedLayouts,
  type HerdrStatus,
  type LayoutNode,
} from "./herdr-slots.ts";

/** The layout Herdr ships as its default, which mine is built from. */
export const DEFAULT_LAYOUT = "main";
/** My layout's name: what it is, not whose. */
export const LAYOUT_NAME = "workbench";
/** The record of the Herdr version the layout was built from, in the app home. */
export const RECORD_FILE = `${NAMESPACE}-sync.json`;

/**
 * The layout the sync built in the Herdr app at `home`, as its record names it; null
 * when there is no record or it can't be read.
 */
export function syncedLayout(home: string): string | null {
  try {
    return layoutFromRecord(readFileSync(join(home, RECORD_FILE), "utf8"));
  } catch {
    return null;
  }
}

/** The layout named in the sync record's text; null when it isn't JSON or names none. */
export function layoutFromRecord(text: string): string | null {
  try {
    const record: unknown = JSON.parse(text);
    return typeof record === "object" &&
      record !== null &&
      "layout" in record &&
      typeof record.layout === "string"
      ? record.layout
      : null;
  } catch {
    return null;
  }
}

const WORKTRUNK = modId("worktrunk");
/** The mod that plays Herdr's tab bar, sidebar and menus with worktrunk items added. */
const MENUS = modId("menus");

/** What an edit gave: the new tree, or why its anchor in Herdr's layout didn't match. */
export type EditResult =
  | { readonly _tag: "Ok"; readonly node: LayoutNode }
  | { readonly _tag: "Failed"; readonly reason: string };

/**
 * One change from Herdr's default layout to mine. Each finds its anchor in Herdr's tree
 * and fails, naming it, when the anchor isn't there exactly once: a Herdr change then
 * stops the sync instead of quietly building a broken layout.
 */
export interface LayoutEdit {
  /** Named in the error when the edit can't apply. */
  readonly name: string;
  /**
   * A mod the edit points the layout at. When it isn't installed, the edit is skipped,
   * so the layout keeps Herdr's own block rather than naming a mod that isn't there.
   */
  readonly needs?: string;
  readonly apply: (root: LayoutNode) => EditResult;
}

const ok = (node: LayoutNode): EditResult => ({ _tag: "Ok", node });
const failed = (reason: string): EditResult => ({ _tag: "Failed", reason });

const countIn = (node: LayoutNode, match: (node: LayoutNode) => boolean): number =>
  (match(node) ? 1 : 0) +
  (node.children ?? []).reduce((sum, child) => sum + countIn(child, match), 0);

const replaceIn = (
  node: LayoutNode,
  match: (node: LayoutNode) => boolean,
  replace: (node: LayoutNode) => LayoutNode,
): LayoutNode =>
  match(node)
    ? replace(node)
    : node.children
      ? { ...node, children: node.children.map((child) => replaceIn(child, match, replace)) }
      : node;

/**
 * Replaces the one node `match` picks with `replace(node)`; fails when `match` picks
 * none or several, naming the anchor as `what`.
 */
export function replaceOne(
  root: LayoutNode,
  what: string,
  match: (node: LayoutNode) => boolean,
  replace: (node: LayoutNode) => LayoutNode,
): EditResult {
  const found = countIn(root, match);
  return found === 1
    ? ok(replaceIn(root, match, replace))
    : failed(`expected exactly one ${what}, found ${found}`);
}

const isTabBar = (node: LayoutNode): boolean => node.content?.mod === "tabs";

const isActiveTab = (node: LayoutNode): boolean => node.content?.tab === "active";

/** The tab bar becomes a row: Herdr's tabs, then the button that shows the panel. */
const tabBarToggle: LayoutEdit = {
  name: "tab-bar toggle",
  apply: (root) =>
    replaceOne(root, 'block showing the "tabs" mod', isTabBar, (tabs) => ({
      id: "tabs-row",
      type: "row",
      ...(tabs.size ? { size: tabs.size } : {}),
      resizable: false,
      children: [
        { ...tabs, size: { weight: 1 } },
        {
          id: "worktrunk-toggle",
          type: "block",
          size: { px: 112 },
          window_drag: true,
          content: { mod: WORKTRUNK, props: { role: "toggle" } },
        },
      ],
    })),
};

/** The worktrunk panel, at the end of the row that holds the active tab. */
const sidePanel: LayoutEdit = {
  name: "worktrunk panel",
  apply: (root) =>
    replaceOne(
      root,
      "row holding the active tab",
      (node) => node.type === "row" && (node.children ?? []).some(isActiveTab),
      (row) => ({
        ...row,
        children: [
          ...(row.children ?? []),
          {
            id: "worktrunk-panel",
            type: "block",
            size: { px: 380 },
            min: 280,
            max: 900,
            content: { mod: WORKTRUNK },
          },
        ],
      }),
    ),
};

/**
 * The block showing Herdr's `mod` now shows the menus mod in `role`, which plays Herdr's
 * mod with worktrunk items added to the menus it opens. The block keeps its id and size.
 */
const wrapperFor = (name: string, mod: string, role: string): LayoutEdit => ({
  name,
  needs: MENUS,
  apply: (root) =>
    replaceOne(
      root,
      `block showing the "${mod}" mod`,
      (node) => node.content?.mod === mod,
      (node) => ({ ...node, content: { mod: MENUS, props: { role } } }),
    ),
});

/** Every change from Herdr's default to my layout, applied in order. */
export const LAYOUT_EDITS: readonly LayoutEdit[] = [
  tabBarToggle,
  sidePanel,
  // After the toggle edit, which finds the tab bar by Herdr's "tabs" mod.
  wrapperFor("tab-bar menus", "tabs", "tabs"),
  wrapperFor("sidebar menus", "spaces", "spaces"),
];

const idsIn = (node: LayoutNode): string[] => [
  ...(typeof node.id === "string" ? [node.id] : []),
  ...(node.children ?? []).flatMap(idsIn),
];

/**
 * My layout from Herdr's default (`base`), or the first edit that failed. Node ids stay
 * unique: an edit whose new ids Herdr's layout already uses fails too, naming them.
 * Edits that need a mod `installed` says is missing are left out.
 */
export function buildLayout(
  base: LayoutNode,
  edits: readonly LayoutEdit[] = LAYOUT_EDITS,
  installed: (mod: string) => boolean = () => true,
): EditResult {
  return edits.reduce<EditResult>((built, edit) => {
    if (edit.needs !== undefined && !installed(edit.needs)) return built;
    if (built._tag === "Failed") return built;
    const result = edit.apply(built.node);
    if (result._tag === "Failed") return failed(`${edit.name}: ${result.reason}`);
    const ids = idsIn(result.node);
    const repeated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    return repeated.length > 0
      ? failed(`${edit.name}: Herdr's layout already uses the id ${repeated.join(", ")}`)
      : result;
  }, ok(base));
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** The version in `herdr-app --version` output (`herdr-app 0.1.14`), or null. */
export function versionFrom(text: string): string | null {
  return /\b(\d+\.\d+\.\d+[\w.+-]*)/.exec(text)?.[1] ?? null;
}

/** Runs `herdr-app` with `args` and returns its stdout. */
const runHerdrApp = (args: readonly string[]): string =>
  execFileSync("herdr-app", [...args], { encoding: "utf8" });

/** Writes `text` to `path` unless the file already holds it, so Herdr reloads nothing. */
const writeIfChanged = (path: string, text: string): void => {
  if (!existsSync(path) || readFileSync(path, "utf8") !== text) writeFileSync(path, text);
};

export interface SyncResult {
  /** The exit code: 0 when the sync finished, 1 when it stopped. */
  readonly code: 0 | 1;
  /** Lines for stdout. */
  readonly out: readonly string[];
  /** Lines for stderr. */
  readonly err: readonly string[];
}

const fail = (line: string): SyncResult => ({
  code: 1,
  out: [],
  err: [`herdr-sync: ${line}`, "herdr-sync: nothing written."],
});

const readBase = (path: string): LayoutNode | null => {
  try {
    // Herdr writes its layout files; the edits check the parts they rely on.
    return JSON.parse(readFileSync(path, "utf8")) as LayoutNode;
  } catch {
    return null;
  }
};

const installedVersion = (herdrApp: (args: readonly string[]) => string): string | null => {
  try {
    return versionFrom(herdrApp(["--version"]));
  } catch {
    return null;
  }
};

/** `herdr-app status` run through `herdrApp`; a failed run means Herdr isn't running. */
const statusThrough = (herdrApp: (args: readonly string[]) => string): HerdrStatus => {
  try {
    return { _tag: "Running", text: herdrApp(["status"]) };
  } catch {
    return { _tag: "NotRunning" };
  }
};

/** The layout Herdr shows, from `status`; null when Herdr isn't running or names none. */
const shownLayout = (shown: HerdrStatus): string | null =>
  shown._tag === "Running" ? layoutFromStatus(shown.text) : null;

/** Asks Herdr to show `layout`; false when `herdr-app` fails. */
const switchTo = (herdrApp: (args: readonly string[]) => string, layout: string): boolean => {
  try {
    herdrApp(["do", "layout.switch", "--name", layout]);
    return true;
  } catch {
    return false;
  }
};

export interface SyncOptions {
  /** The Herdr app home. Defaults to `herdrHome()`. */
  readonly home?: string;
  /** Runs `herdr-app` and returns its stdout. Defaults to the real command. */
  readonly herdrApp?: (args: readonly string[]) => string;
  /** Gives `herdr-app status`. Defaults to running it through `herdrApp`. */
  readonly status?: () => HerdrStatus;
}

/** Builds my layout and the version record in the Herdr app at `home`. */
export function herdrSync({
  home = herdrHome(),
  herdrApp = runHerdrApp,
  status = () => statusThrough(herdrApp),
}: SyncOptions = {}): SyncResult {
  const basePath = join(home, "layouts", `${DEFAULT_LAYOUT}.json`);
  const base = readBase(basePath);
  if (base === null) return fail(`can't read Herdr's default layout, ${basePath}.`);
  const version = installedVersion(herdrApp);
  if (version === null) {
    return fail("can't find the Herdr version: is `herdr-app --version` on PATH?");
  }

  const shipped = shippedLayouts(home);
  if (shipped.has(LAYOUT_NAME)) {
    return fail(`a layout named "${LAYOUT_NAME}" ships with Herdr; refusing to overwrite it.`);
  }
  const installed = (mod: string) => existsSync(join(home, "mods", mod, "main.js"));
  const built = buildLayout(base, LAYOUT_EDITS, installed);
  const missing = [
    ...new Set(LAYOUT_EDITS.flatMap((e) => (e.needs && !installed(e.needs) ? [e.needs] : []))),
  ];
  if (built._tag === "Failed") {
    return fail(
      `Herdr's default layout has changed, so this patch point no longer fits: ${built.reason}.`,
    );
  }
  const previous = syncedLayout(home);
  // Only a layout the record names was built by sync; any other file is the person's,
  // and a layout Herdr ships is Herdr's.
  const retired =
    previous !== null && previous !== LAYOUT_NAME && !shipped.has(previous) ? previous : null;
  writeIfChanged(join(home, "layouts", `${LAYOUT_NAME}.json`), json(built.node));
  // Herdr moves off the old layout first, so it never shows a layout that's gone.
  const switching = retired !== null && shownLayout(status()) === retired;
  if (switching && !switchTo(herdrApp, LAYOUT_NAME)) {
    // The record keeps naming the old layout, so the next run retires it.
    return {
      code: 1,
      out: [],
      err: [
        `herdr-sync: wrote layout "${LAYOUT_NAME}", but couldn't switch Herdr to it from "${retired}", so "${retired}" is kept.`,
        `herdr-sync: switch with herdr-app do layout.switch --name ${LAYOUT_NAME}, then sync again.`,
      ],
    };
  }
  if (retired !== null) rmSync(join(home, "layouts", `${retired}.json`), { force: true });
  writeIfChanged(
    join(home, RECORD_FILE),
    json({ layout: LAYOUT_NAME, from: DEFAULT_LAYOUT, version }),
  );
  return {
    code: 0,
    out: [
      `herdr-sync: wrote layout "${LAYOUT_NAME}" from Herdr's "${DEFAULT_LAYOUT}" (Herdr ${version}).`,
      ...(retired === null
        ? []
        : [`herdr-sync: removed layout "${retired}", which an earlier sync built.`]),
      switching
        ? `herdr-sync: switched Herdr from "${retired}" to "${LAYOUT_NAME}".`
        : `herdr-sync: nothing switched. Switch to it with Herdr's layout switch (layout.switch), or: herdr-app do layout.switch --name ${LAYOUT_NAME}`,
      ...missing.map(
        (mod) =>
          `herdr-sync: ${mod} isn't installed, so the layout keeps Herdr's own blocks for it. Install it (or run its dev build), then sync again.`,
      ),
    ],
    err: [],
  };
}

if (import.meta.main) {
  const result = herdrSync();
  result.out.forEach((line) => console.log(line));
  result.err.forEach((line) => console.error(line));
  process.exitCode = result.code;
}
