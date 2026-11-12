// Removes a mod's dev build from the Herdr app (made by `vp run <name>#dev`):
// its folder, <app home>/mods/<name>/, and its slots in your layouts, so the panel goes too.
// A folder without the dev marker is a real installed mod: it and its slots are left alone.
//
//   vp run dev:remove <name>
import { Effect } from "effect";
import { type LoadOptions, loadDevTarget } from "./dev-config.ts";
import { HerdrHost, hostLayer, type HostUnreachable, type TransportError } from "./herdr-host.ts";
import { applySlotRemoval, herdrHome, planSlotRemoval } from "./herdr-slots.ts";

export interface DevRemoveResult {
  /**
   * The exit code: 2 for a usage error, 1 for an installed mod or a layout that
   * couldn't be read, 0 otherwise.
   */
  readonly code: 0 | 1 | 2;
  /** Lines for stdout. */
  readonly out: readonly string[];
  /** Lines for stderr. */
  readonly err: readonly string[];
}

const usage: DevRemoveResult = { code: 2, out: [], err: ["usage: vp run dev:remove <name>"] };

/** Exit 1 with `message` on stderr. */
const failed = (message: string): DevRemoveResult => ({
  code: 1,
  out: [],
  err: [`dev-remove: ${message}`],
});

/** Removes the dev build named in `args` from the Herdr host. */
export const devRemoveOnHost = Effect.fn("devRemoveOnHost")(function* (
  args: readonly string[],
): Effect.fn.Return<DevRemoveResult, TransportError | HostUnreachable, HerdrHost> {
  const name = args[0];
  if (!name || args.length > 1 || name.includes("/") || name.startsWith(".")) return usage;

  const host = yield* HerdrHost;
  const dir = host.location(`mods/${name}`);
  // Every layout is read before anything on the host changes, so a host that
  // can't be reached, or drops while being read, leaves it all as it was.
  const plan = yield* planSlotRemoval(name);
  const removed = yield* host
    .removeDevBuild(name)
    .pipe(Effect.catchTag("InstalledModInTheWay", () => Effect.succeed("Installed" as const)));
  if (removed === "Installed") {
    return {
      code: 1,
      out: [],
      err: [`dev-remove: ${dir} is an installed mod, not a dev build; left alone`],
    };
  }
  const files =
    removed === "Removed" ? `dev-remove: removed ${dir}` : `dev-remove: no files at ${dir}`;

  // A layout that can't be read is left as it is; every readable one is still cleaned,
  // so the lines above stay true and the skipped ones are named on stderr.
  const { changed, skipped } = yield* applySlotRemoval(plan);
  const quoted = (names: readonly string[]) => names.map((l) => `"${l}"`).join(", ");
  const panel =
    changed.length > 0
      ? `dev-remove: removed the ${name} panel from ${quoted(changed)}`
      : `dev-remove: no ${name} panel in your layouts`;

  return skipped.length > 0
    ? {
        code: 1,
        out: [files, panel],
        err: [`dev-remove: could not read these layouts, so left them alone: ${quoted(skipped)}`],
      }
    : { code: 0, out: [files, panel], err: [] };
});

/** Removes the dev build named in `args` from the dev target's Herdr host. */
export const runDevRemove = Effect.fn("runDevRemove")(function* (
  args: readonly string[],
  options: LoadOptions = {},
) {
  const target = yield* loadDevTarget(options);
  return yield* devRemoveOnHost(args).pipe(
    Effect.provide(hostLayer(target)),
    Effect.catchTag("HostUnreachable", (error) => Effect.succeed(failed(error.message))),
  );
});

/** `devRemoveOnHost` against the Herdr app on this machine, at `home`. */
export function devRemove(args: readonly string[], home: string): DevRemoveResult {
  return Effect.runSync(devRemoveOnHost(args).pipe(Effect.provide(HerdrHost.local(home))));
}

if (import.meta.main) {
  const result = devRemove(process.argv.slice(2), herdrHome());
  result.out.forEach((line) => console.log(line));
  result.err.forEach((line) => console.error(line));
  process.exitCode = result.code;
}
