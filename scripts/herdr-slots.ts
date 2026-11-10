// A mod shows in Herdr through a slot: a `block` node in a layout file
// (<app home>/layouts/<name>.json) whose content is { mod: "<name>" }.
// Herdr adds a slot only the first time it ever sees a mod, and remembers that
// in memory, so a dev build that comes back needs its slot put back by us.
// Layout files are live: Herdr applies an edit at once.
// Every read and write of the Herdr home, and every herdr-app call, goes through HerdrHost.
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { Data, Effect, Predicate } from "effect";
import { HerdrHost, type HostUnreachable, type TransportError } from "./herdr-host.ts";

export interface LayoutNode {
  id?: string;
  type?: string;
  /** `{ mod, props? }`, `{ tab, pane? }`, `{ terminal }` or `{ agent }`. */
  content?: { mod?: string; [key: string]: unknown };
  size?: { px?: number; weight?: number };
  children?: LayoutNode[];
  [key: string]: unknown;
}

export type Place = "left" | "right" | "top" | "bottom" | "none";

export { DEV_MARKER } from "./herdr-host.ts";

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

/** A layout file's text as a tree; throws when it isn't JSON. */
function parseLayout(text: string): LayoutNode {
  // Herdr writes layout files; this script trusts their shape rather than parsing it.
  return JSON.parse(text) as LayoutNode;
}

const layoutText = (layout: LayoutNode): string => `${JSON.stringify(layout, null, 2)}\n`;

const layoutFile = (name: string): string => `layouts/${name}.json`;

/** The `layout:` names in installed.json's text; none when it isn't a JSON object. */
function shippedFrom(text: string): Set<string> {
  try {
    // Only the keys are read, so a non-object can't add a layout: JSON `null` makes
    // Object.keys throw (caught below: an empty set), and a string, number or array
    // gives only index keys or none, never a "layout:" key.
    const installed = JSON.parse(text) as object;
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
 * Layouts that ship with Herdr: their structure can't be edited, only cloned.
 * None when installed.json is missing or isn't a JSON object.
 */
const shippedOnHost: Effect.Effect<
  Set<string>,
  TransportError | HostUnreachable,
  HerdrHost
> = Effect.gen(function* () {
  const host = yield* HerdrHost;
  return yield* host.readFile("installed.json").pipe(
    Effect.map(shippedFrom),
    Effect.catchTag("FileMissing", () => Effect.succeed(new Set<string>())),
  );
});

/** `shippedOnHost` against the Herdr app on this machine, at `home`; none when it can't be read. */
export function shippedLayouts(home: string): Set<string> {
  return Effect.runSync(
    shippedOnHost.pipe(
      Effect.orElseSucceed(() => new Set<string>()),
      Effect.provide(HerdrHost.local(home)),
    ),
  );
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

/** The fields of a mod's `assets/mod.json` that decide where its slot goes. */
export type ModJson = { readonly place?: Place; readonly size?: number };

/**
 * What `herdr-app status` gave. `NotInstalled`: there is no `herdr-app` to run.
 * `NotRunning`: it ran and failed, which is what it does while the app is closed.
 */
export type HerdrStatus =
  | { readonly _tag: "NotInstalled" }
  | { readonly _tag: "NotRunning" }
  | { readonly _tag: "Running"; readonly text: string };

/** Whether a failure to start a command says it isn't there. */
const notFound = (cause: unknown): boolean =>
  Predicate.hasProperty(cause, "code") && cause.code === "ENOENT";

/** Runs `herdr-app status` on the Herdr host. Fails only when the host can't be reached. */
const herdrStatus: Effect.Effect<HerdrStatus, HostUnreachable, HerdrHost> = Effect.gen(
  function* () {
    const host = yield* HerdrHost;
    return yield* host.herdrApp(["status"]).pipe(
      Effect.map(({ stdout }): HerdrStatus => ({ _tag: "Running", text: stdout })),
      Effect.catchTags({
        // It ran and failed, which is what it does while the app is closed.
        CommandFailed: () => Effect.succeed<HerdrStatus>({ _tag: "NotRunning" }),
        // It couldn't start: not installed when it isn't there, else not answering.
        TransportError: ({ cause }) =>
          Effect.succeed<HerdrStatus>(
            notFound(cause) ? { _tag: "NotInstalled" } : { _tag: "NotRunning" },
          ),
      }),
    );
  },
);

/** A layout file isn't JSON, or its tree can't be walked. */
class LayoutUnreadable extends Data.TaggedError("LayoutUnreadable")<{
  readonly layout: string;
  readonly cause: unknown;
}> {}

/** What reading and cleaning one layout gave: its tree without the slots, or null. */
type Cleaned = {
  readonly name: string;
  readonly result: { node: LayoutNode; removed: number } | null;
};

/** The layout without `mod`'s slots; null when the file can't be read, parsed or walked. */
const cleanLayout = (
  name: string,
  mod: string,
): Effect.Effect<{ node: LayoutNode; removed: number } | null, HostUnreachable, HerdrHost> =>
  Effect.gen(function* () {
    const host = yield* HerdrHost;
    return yield* host.readFile(layoutFile(name)).pipe(
      Effect.flatMap((text) =>
        Effect.try({
          try: () => withoutSlots(parseLayout(text), mod),
          catch: (cause) => new LayoutUnreadable({ layout: name, cause }),
        }),
      ),
      // A layout that can't be read, parsed or walked is named in `skipped`, not lost.
      // An unreachable host is not a layout problem: it stops the run.
      Effect.catchTags({
        FileMissing: () => Effect.succeed(null),
        TransportError: () => Effect.succeed(null),
        LayoutUnreadable: () => Effect.succeed(null),
      }),
    );
  });

/**
 * What removing `mod`'s slots from the person's own layouts (not the shipped ones)
 * will write: each layout that has a slot, without it, except the layouts to keep.
 * `kept` names the layouts to keep that hold a slot; they are never written.
 * `skipped` names the layouts whose file couldn't be read or parsed; they are left
 * as they are. Only reads, so nothing on the host changes. Every list is sorted by name.
 */
export interface SlotRemoval {
  readonly toWrite: ReadonlyArray<{ readonly name: string; readonly node: LayoutNode }>;
  readonly kept: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
}

/**
 * Reads every layout and works out what removing `mod`'s slots will write, never
 * writing a layout named in `keep`. Fails only when the host can't be reached; a
 * layout it can't read is skipped.
 */
export const planSlotRemoval = Effect.fn("planSlotRemoval")(function* (
  mod: string,
  keep: ReadonlyArray<string> = [],
) {
  const host = yield* HerdrHost;
  const files = yield* host
    .listDir("layouts")
    .pipe(Effect.catchTag("FileMissing", () => Effect.succeed<ReadonlyArray<string>>([])));
  if (files.length === 0) return { toWrite: [], kept: [], skipped: [] } satisfies SlotRemoval;
  const shipped = yield* shippedOnHost;
  const names = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .filter((name) => !shipped.has(name))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const cleaned: ReadonlyArray<Cleaned> = yield* Effect.forEach(names, (name) =>
    Effect.map(cleanLayout(name, mod), (result) => ({ name, result })),
  );
  const withSlots = cleaned.flatMap(({ name, result }) =>
    result !== null && result.removed > 0 ? [{ name, node: result.node }] : [],
  );
  return {
    toWrite: withSlots.filter(({ name }) => !keep.includes(name)),
    kept: withSlots.filter(({ name }) => keep.includes(name)).map(({ name }) => name),
    skipped: cleaned.filter(({ result }) => result === null).map(({ name }) => name),
  } satisfies SlotRemoval;
});

/** Writes the layouts a `planSlotRemoval` gave. `changed` names them; `kept` and `skipped` are the plan's. */
export const applySlotRemoval = Effect.fn("applySlotRemoval")(function* (removal: SlotRemoval) {
  const host = yield* HerdrHost;
  yield* Effect.forEach(removal.toWrite, ({ name, node }) =>
    host.writeFile(layoutFile(name), layoutText(node)),
  );
  return {
    changed: removal.toWrite.map(({ name }) => name),
    kept: [...removal.kept],
    skipped: [...removal.skipped],
  };
});

/**
 * Removes every slot for `mod` from the person's own layouts (not the shipped
 * ones), except the layouts named in `keep`, which are never written. `changed`
 * names the layouts rewritten; `kept` names those in `keep` that hold a slot for
 * `mod`; `skipped` names those whose file couldn't be read or parsed, which are
 * left as they are. Every layout is read before any is written, and a skipped one
 * never stops the rest being cleaned. Every list is sorted by name.
 */
export const removeSlotsOnHost = (mod: string, keep: ReadonlyArray<string> = []) =>
  Effect.flatMap(planSlotRemoval(mod, keep), applySlotRemoval);

/** `removeSlotsOnHost` against the Herdr app on this machine, at `home`. */
export function removeSlots(
  mod: string,
  home = herdrHome(),
  keep: readonly string[] = [],
): { changed: string[]; kept: string[]; skipped: string[] } {
  return Effect.runSync(removeSlotsOnHost(mod, keep).pipe(Effect.provide(HerdrHost.local(home))));
}

/**
 * Makes sure the shown layout has a slot for `mod`, adding one from its
 * mod.json `place` (default "right") and `size` if not. Returns a line for the
 * person. `status` gives `herdr-app status` (default: running it on the host).
 */
export const ensureSlotOnHost = Effect.fn("ensureSlotOnHost")(function* (
  mod: string,
  modJson: ModJson,
  status: Effect.Effect<HerdrStatus, HostUnreachable, HerdrHost> = herdrStatus,
) {
  const host = yield* HerdrHost;
  const shown = yield* status;
  if (shown._tag === "NotInstalled") {
    return `herdr-slots: herdr-app not found on PATH; install the Herdr app to see ${mod}.`;
  }
  const layout = shown._tag === "Running" ? layoutFromStatus(shown.text) : null;
  if (!layout) return `herdr-slots: Herdr isn't running; open it to see ${mod}.`;
  if ((yield* shippedOnHost).has(layout)) {
    return `herdr-slots: "${layout}" ships with Herdr and can't take new slots; clone it, or add ${mod} by hand.`;
  }
  const text = yield* host.readFile(layoutFile(layout)).pipe(
    Effect.map((found): string | null => found),
    Effect.catchTag("FileMissing", () => Effect.succeed(null)),
  );
  if (text === null) return `herdr-slots: no file for layout "${layout}"; add ${mod} by hand.`;
  const root = parseLayout(text);
  if (hasSlot(root, mod)) return `herdr-slots: ${mod} already has a slot in "${layout}".`;
  const place = modJson.place ?? "right";
  const next = withSlot(root, mod, place, modJson.size);
  if (!next) {
    return `herdr-slots: can't dock ${mod} at "${place}" automatically; add it to "${layout}" by hand.`;
  }
  yield* host.writeFile(layoutFile(layout), layoutText(next));
  return `herdr-slots: added ${mod} to "${layout}" (${place}).`;
});

/**
 * `ensureSlotOnHost` against the Herdr app on this machine. `home` is the Herdr
 * app's home (default `herdrHome()`); `status` stands in for `herdr-app status`
 * (default: the real command), and tests pass a fake.
 */
export function ensureSlot(
  mod: string,
  modJson: ModJson,
  {
    home = herdrHome(),
    status,
  }: { readonly home?: string; readonly status?: () => HerdrStatus } = {},
): string {
  const shown = status === undefined ? herdrStatus : Effect.sync(status);
  return Effect.runSync(
    ensureSlotOnHost(mod, modJson, shown).pipe(Effect.provide(HerdrHost.local(home))),
  );
}
