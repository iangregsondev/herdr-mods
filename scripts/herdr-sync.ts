// Builds the repo's Herdr layout from Herdr's current default layout, so the mods and
// Herdr's design come together and keep Herdr's later improvements.
//
//   vp run herdr:sync
//
// It works on the dev target's Herdr host (herdr-dev.json: local, or remote over SSH),
// through HerdrHost. Reads <app home>/layouts/main.json (Herdr's default, never edited)
// and writes:
//   <app home>/layouts/<layout>.json      Herdr's default plus the repo's additions
//   <app home>/<namespace>-sync.json      the layout and the Herdr version it was built from
// <layout> is the dev config's `layout`, Workbench by default. The same layout shows
// finished mods and dev builds, and the dev loop adds panels only to it.
// The worktrunk panel compares that record with the installed version and asks for a
// new sync when Herdr has moved on. Re-run it after every Herdr update.
//
// It refuses a name Herdr ships, or the name of a layout it didn't build, ignoring case.
// When the record names another layout (an earlier sync's, under an older name), that
// layout is removed, and if Herdr was showing it, Herdr switches to the new one first.
// A name that changes only in case is renamed instead, since on a file system that
// ignores case the old and new names are one file. A layout the record doesn't name is
// never removed. It never edits Herdr's own files, never switches layouts otherwise,
// and keeps none of Herdr's code in this repo: it reads the installed files each time.
import { Effect } from "effect";
import { modId, NAMESPACE } from "../mod-pack.ts";
import { devConfigProblem, type LoadOptions, loadDevTarget } from "./dev-config.ts";
import {
  causeText,
  HerdrHost,
  hostLayer,
  type HostUnreachable,
  type TransportError,
} from "./herdr-host.ts";
import {
  herdrStatus,
  layoutFromStatus,
  shippedOnHost,
  type HerdrStatus,
  type LayoutNode,
} from "./herdr-slots.ts";

/** The layout Herdr ships as its default, which the repo's layout is built from. */
export const BASE_LAYOUT = "main";
/** The record of the Herdr version the layout was built from, in the app home. */
export const RECORD_FILE = `${NAMESPACE}-sync.json`;

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
 * One change from Herdr's default layout to the repo's. Each finds its anchor in Herdr's tree
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

/** Every change from Herdr's default to the repo's layout, applied in order. */
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

const layoutFile = (name: string): string => `layouts/${name}.json`;

/** Where a layout waits while its name changes case; not a .json, so Herdr ignores it. */
const RENAMING = "layouts/.herdr-sync-renaming";

/**
 * Whether two layout names are the same file on a file system that ignores case,
 * as macOS's does by default: `workbench` and `Workbench` are one layout there.
 */
const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** A file's text on the Herdr host, or null when it isn't there. */
const readIfThere = (relPath: string) =>
  HerdrHost.use((host) =>
    host.readFile(relPath).pipe(
      Effect.map((text): string | null => text),
      Effect.catchTag("FileMissing", () => Effect.succeed(null)),
    ),
  );

/** A layout file's text as a tree; null when it isn't JSON. */
const parseBase = (text: string): LayoutNode | null => {
  try {
    // Herdr writes its layout files; the edits check the parts they rely on.
    return JSON.parse(text) as LayoutNode;
  } catch {
    return null;
  }
};

/** Herdr's default layout as a tree; null when it is missing or isn't JSON. */
const readBase = Effect.map(readIfThere(layoutFile(BASE_LAYOUT)), (text) =>
  text === null ? null : parseBase(text),
);

/** The installed Herdr version, or null when `herdr-app --version` fails or names none. */
const installedVersion = HerdrHost.use((host) =>
  host.herdrApp(["--version"]).pipe(
    Effect.map(({ stdout }) => versionFrom(stdout)),
    Effect.catchTags({
      CommandFailed: () => Effect.succeed(null),
      TransportError: () => Effect.succeed(null),
    }),
  ),
);

/** The layout the sync built, as its record names it; null when there is no record or it names none. */
const syncedLayout = Effect.map(readIfThere(RECORD_FILE), (text) =>
  text === null ? null : layoutFromRecord(text),
);

/** The names of the layouts on the Herdr host; none when there is no layouts folder. */
const layoutNames = HerdrHost.use((host) =>
  host.listDir("layouts").pipe(
    Effect.map((files) =>
      files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -".json".length)),
    ),
    Effect.catchTag("FileMissing", () => Effect.succeed<ReadonlyArray<string>>([])),
  ),
);

/** Whether `mod` is installed on the Herdr host: its folder holds a main.js. */
const isInstalled = (mod: string) =>
  HerdrHost.use((host) =>
    host.listDir(`mods/${mod}`).pipe(
      Effect.map((entries) => entries.includes("main.js")),
      Effect.catchTag("FileMissing", () => Effect.succeed(false)),
    ),
  );

/** Writes `text` to `relPath` unless the file already holds it, so Herdr reloads nothing. */
const writeIfChanged = (relPath: string, text: string) =>
  Effect.gen(function* () {
    const host = yield* HerdrHost;
    if ((yield* readIfThere(relPath)) !== text) yield* host.writeFile(relPath, text);
  });

/** Asks Herdr to show `layout`; false when `herdr-app` fails. */
const switchTo = (layout: string) =>
  HerdrHost.use((host) =>
    host.herdrApp(["do", "layout.switch", "--name", layout]).pipe(
      Effect.as(true),
      Effect.catchTags({
        CommandFailed: () => Effect.succeed(false),
        TransportError: () => Effect.succeed(false),
      }),
    ),
  );

/**
 * What happens to the layout an earlier sync built under another name, as the record
 * names it. `Retire`: another name, so Herdr switches off it, then it is removed.
 * `Rename`: the same name in another case, which is one file where case is ignored,
 * so the file is renamed rather than written anew and the old name removed.
 */
type OldLayout =
  | { readonly _tag: "None" }
  | { readonly _tag: "Retire"; readonly name: string }
  | { readonly _tag: "Rename"; readonly name: string };

/**
 * The old layout for building `layout`, from the name the record gives (`previous`).
 * A layout Herdr ships is never the sync's; a renamed one must still be there.
 */
const oldLayout = (
  previous: string | null,
  layout: string,
  shipped: ReadonlySet<string>,
  names: ReadonlyArray<string>,
): OldLayout =>
  previous === null || previous === layout || shipped.has(previous)
    ? { _tag: "None" }
    : !sameName(previous, layout)
      ? { _tag: "Retire", name: previous }
      : names.includes(previous)
        ? { _tag: "Rename", name: previous }
        : { _tag: "None" };

/**
 * Builds `layout` and the version record on the Herdr host. `status` gives
 * `herdr-app status` (default: running it on the host); it runs only when an old
 * layout is retired or renamed.
 */
export const herdrSyncOnHost = Effect.fn("herdrSyncOnHost")(function* (
  layout: string,
  status: Effect.Effect<HerdrStatus, HostUnreachable, HerdrHost> = herdrStatus,
): Effect.fn.Return<SyncResult, TransportError | HostUnreachable, HerdrHost> {
  const host = yield* HerdrHost;
  const base = yield* readBase;
  if (base === null) {
    return fail(`can't read Herdr's default layout, ${host.location(layoutFile(BASE_LAYOUT))}.`);
  }
  const version = yield* installedVersion;
  if (version === null) {
    return fail("can't find the Herdr version: is `herdr-app --version` on PATH?");
  }

  const shipped = yield* shippedOnHost;
  const shippedClash = [...shipped].find((name) => sameName(name, layout));
  if (shippedClash !== undefined) {
    return fail(
      `the layout name "${layout}" is taken: "${shippedClash}" ships with Herdr. Set another "layout" in herdr-dev.json.`,
    );
  }
  const previous = yield* syncedLayout;
  const names = yield* layoutNames;
  // Only the file the record names, spelt exactly so, is the sync's: on a file system
  // that keeps case apart, `Workbench` beside a recorded `workbench` is someone's own.
  const clash = names.find((name) => sameName(name, layout) && name !== previous);
  if (clash !== undefined) {
    return fail(
      `the layout name "${layout}" is taken: herdr:sync didn't build "${clash}", so it is someone's own. Set another "layout" in herdr-dev.json.`,
    );
  }
  const needed = [...new Set(LAYOUT_EDITS.flatMap((e) => (e.needs ? [e.needs] : [])))];
  const present = yield* Effect.forEach(needed, (mod) =>
    Effect.map(isInstalled(mod), (found) => (found ? [mod] : [])),
  );
  const installedMods = new Set(present.flat());
  const installed = (mod: string) => installedMods.has(mod);
  const built = buildLayout(base, LAYOUT_EDITS, installed);
  const missing = needed.filter((mod) => !installed(mod));
  if (built._tag === "Failed") {
    return fail(
      `Herdr's default layout has changed, so this patch point no longer fits: ${built.reason}.`,
    );
  }
  const old = oldLayout(previous, layout, shipped, names);
  const oldName = old._tag === "None" ? null : old.name;
  // A rename goes in two steps, since a rename to the same name in another case can do
  // nothing. Herdr can't switch to the new name first: it has no file until the rename.
  if (old._tag === "Rename") {
    yield* host.renameFile(layoutFile(old.name), RENAMING);
    yield* host.renameFile(RENAMING, layoutFile(layout));
  }
  yield* writeIfChanged(layoutFile(layout), json(built.node));
  // Herdr moves off the old name before it is removed, so it never shows a layout that's gone.
  const shown = oldName === null ? null : yield* status;
  const switching =
    oldName !== null && shown?._tag === "Running" && layoutFromStatus(shown.text) === oldName;
  const switched = switching && (yield* switchTo(layout));
  if (switching && !switched && old._tag === "Retire") {
    // The record keeps naming the old layout, so the next run retires it.
    return {
      code: 1,
      out: [],
      err: [
        `herdr-sync: wrote layout "${layout}", but couldn't switch Herdr to it from "${old.name}", so "${old.name}" is kept.`,
        `herdr-sync: switch with herdr-app do layout.switch --name ${layout}, then sync again.`,
      ],
    };
  }
  if (old._tag === "Retire") yield* host.removeFile(layoutFile(old.name));
  yield* writeIfChanged(RECORD_FILE, json({ layout, from: BASE_LAYOUT, version }));
  if (switching && !switched) {
    // Only the old case is gone: the layout is there under its new name.
    return {
      code: 1,
      out: [],
      err: [
        `herdr-sync: renamed layout "${oldName}" to "${layout}", but couldn't switch Herdr to it.`,
        `herdr-sync: switch with herdr-app do layout.switch --name ${layout}`,
      ],
    };
  }
  return {
    code: 0,
    out: [
      `herdr-sync: wrote layout "${layout}" from Herdr's "${BASE_LAYOUT}" (Herdr ${version}).`,
      ...(old._tag === "Retire"
        ? [`herdr-sync: removed layout "${old.name}", which an earlier sync built.`]
        : []),
      ...(old._tag === "Rename"
        ? [`herdr-sync: renamed layout "${old.name}" to "${layout}".`]
        : []),
      switching
        ? `herdr-sync: switched Herdr from "${oldName}" to "${layout}".`
        : `herdr-sync: nothing switched. Switch to it with Herdr's layout switch (layout.switch), or: herdr-app do layout.switch --name ${layout}`,
      ...missing.map(
        (mod) =>
          `herdr-sync: ${mod} isn't installed, so the layout keeps Herdr's own blocks for it. Install it (or run its dev build), then sync again.`,
      ),
    ],
    err: [],
  };
});

/**
 * Runs the sync on the dev target's Herdr host. Never fails: a host that can't be
 * reached, a file it can't read or write, or a dev config that can't be read is
 * exit 1 with a line saying so.
 */
export const runHerdrSync = Effect.fn("runHerdrSync")(function* (
  options: LoadOptions = {},
): Effect.fn.Return<SyncResult> {
  return yield* loadDevTarget(options).pipe(
    Effect.flatMap((target) =>
      herdrSyncOnHost(target.layout).pipe(Effect.provide(hostLayer(target))),
    ),
    Effect.catchTags({
      HostUnreachable: (error) => Effect.succeed(fail(error.message)),
      TransportError: ({ operation, cause }) =>
        Effect.succeed(fail(`couldn't ${operation} (${causeText(cause)})`)),
      DevConfigInvalid: (error) => Effect.succeed(fail(devConfigProblem(error))),
      DevConfigUnreadable: (error) => Effect.succeed(fail(devConfigProblem(error))),
    }),
  );
});

if (import.meta.main) {
  const result = await Effect.runPromise(runHerdrSync());
  result.out.forEach((line) => console.log(line));
  result.err.forEach((line) => console.error(line));
  process.exitCode = result.code;
}
