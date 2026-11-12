// Puts the Herdr app's type files (herdr.d.ts, gpui-kit.d.ts) into .herdr-types/
// (git-ignored), from the dev target's Herdr host. The app rewrites them on every
// start, so they match the installed version.
// - local: links them from the Herdr home, so they always match the app.
// - remote: copies them from the host as real files, replacing any old links (a
//   link to a path on another machine would dangle here).
// No type files, or no reachable host (CI, a laptop asleep): warns and exits 0,
// so `vp install` still succeeds; only the mods' type-checks then fail.
//
//   vp run types            (also run by `prepare` on every `vp install`, and by
//                            every `vp run <name>#dev` when it starts)
//   vpx scripts/herdr-types.ts [folder]
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Predicate, Result } from "effect";
import { type DevTarget, type LoadOptions, loadDevTarget } from "./dev-config.ts";
import { CommandFailed, HerdrHost, hostLayer, TransportError } from "./herdr-host.ts";

/** What to print and the exit code. */
export interface TypesResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Where the types go by default: `.herdr-types/` at the repo root (git-ignored). */
export const TYPES_DIR = join(fileURLToPath(new URL("..", import.meta.url)), ".herdr-types");

/** A failure's cause as text: what a failed command said, else its message. */
const causeText = (cause: unknown): string =>
  cause instanceof CommandFailed
    ? cause.stderr.trim()
    : Predicate.hasProperty(cause, "message")
      ? String(cause.message)
      : String(cause);

/** The type files the Herdr app writes into its home on every start. */
const TYPE_FILES = ["herdr.d.ts", "gpui-kit.d.ts"] as const;

/**
 * Removes whatever is at `path` on this machine, a link (dangling or not) included,
 * so what comes next writes a new entry instead of following an old link.
 */
const clear = (path: string): Effect.Effect<void, TransportError> =>
  Effect.try({
    try: () => rmSync(path, { force: true }),
    catch: (cause) => new TransportError({ operation: `remove ${path}`, cause }),
  });

/** Points `path` on this machine at `source`. */
const link = (source: string, path: string): Effect.Effect<void, TransportError> =>
  Effect.try({
    try: () => symlinkSync(source, path),
    catch: (cause) => new TransportError({ operation: `link ${path} to ${source}`, cause }),
  });

/** Makes the folder `dest` on this machine. */
const makeDir = (dest: string): Effect.Effect<void, TransportError> =>
  Effect.try({
    try: () => {
      mkdirSync(dest, { recursive: true });
    },
    catch: (cause) => new TransportError({ operation: `make ${dest}`, cause }),
  });

/** Exit 1 with `message` on stderr. */
const failure = (message: string): TypesResult => ({
  code: 1,
  stdout: "",
  stderr: `herdr-types: ${message}\n`,
});

/**
 * Exit 0 with `reason` on stderr: with no types, `vp install` and a watch still
 * go on, and only the mods' type-checks fail.
 */
const skipped = (reason: string): TypesResult => ({
  code: 0,
  stdout: "",
  stderr: `herdr-types: ${reason}; skipping (mod type-checks will fail)\n`,
});

/**
 * Puts the type files from `target`'s Herdr home into `dest`. Never fails: no
 * types or no reachable host is a warning with exit 0; anything else that goes
 * wrong is exit 1, naming what couldn't be done.
 */
export const refreshHerdrTypes = Effect.fn("refreshHerdrTypes")(function* (
  target: DevTarget,
  dest: string = TYPES_DIR,
): Effect.fn.Return<TypesResult> {
  return yield* Effect.gen(function* () {
    const host = yield* HerdrHost;
    const present = yield* host
      .listDir("")
      .pipe(Effect.catchTag("FileMissing", () => Effect.succeed<ReadonlyArray<string>>([])));
    // The Remote layer names the home with a trailing slash; drop it for messages.
    const home = host.location("").replace(/\/$/, "");
    if (!TYPE_FILES.every((file) => present.includes(file))) {
      return skipped(`no Herdr app types in ${home}`);
    }
    yield* makeDir(dest);
    // Local: a link, which always matches the app's current files. Remote: a real
    // copy, since a link to a path on another machine would dangle here.
    yield* Effect.forEach(TYPE_FILES, (file) =>
      clear(join(dest, file)).pipe(
        Effect.andThen(
          target._tag === "Local"
            ? link(host.location(file), join(dest, file))
            : host.copyBack(file, join(dest, file)),
        ),
      ),
    );
    const verb = target._tag === "Local" ? "linked" : "copied";
    return {
      code: 0,
      stdout: `herdr-types: ${verb} ${home}/{herdr,gpui-kit}.d.ts -> ${dest}\n`,
      stderr: "",
    };
  }).pipe(
    Effect.provide(hostLayer(target)),
    Effect.catchTags({
      TransportError: ({ operation, cause }) =>
        Effect.succeed(failure(`couldn't ${operation} (${causeText(cause)})`)),
      HostUnreachable: (error) => Effect.succeed(skipped(error.message)),
    }),
  );
});

/** Refreshes the types for the dev target in herdr-dev.json (or HERDR_DEV_CONFIG). */
export const runHerdrTypes = Effect.fn("runHerdrTypes")(function* (
  dest: string = TYPES_DIR,
  options: LoadOptions = {},
): Effect.fn.Return<TypesResult> {
  const loaded = yield* Effect.result(loadDevTarget(options));
  if (Result.isFailure(loaded)) {
    const error = loaded.failure;
    return failure(
      error._tag === "DevConfigInvalid"
        ? `${error.file}: ${error.field}: ${error.message}`
        : `couldn't read ${error.file} (${causeText(error.cause)})`,
    );
  }
  return yield* refreshHerdrTypes(loaded.success, dest);
});

if (import.meta.main) {
  const result = await Effect.runPromise(runHerdrTypes(process.argv[2] ?? TYPES_DIR));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
