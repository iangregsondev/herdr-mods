// The panel's reads as Effect programs over the Files and Shell services: settings (with
// the one-time import of the old mod's file), the repos, and each repo's worktrees.
// Every failure the panel can show comes back as a value, so main.ts only runs these and
// keeps what they return. Pure: no `herdr` or `gpui` imports.
import { Effect, Option, Result } from "effect";
import { Files, type FileError } from "./files.ts";
import {
  DEFAULT_SETTINGS,
  lastSegment,
  parseSettings,
  planImport,
  type ParsedSettings,
  type Settings,
} from "./settings.ts";
import { reposFrom, type FoundRepo, type Repo } from "./repos.ts";
import { syncNotice } from "./sync.ts";
import {
  causeText,
  failureText,
  reposOf,
  scanRepos,
  wtCi,
  wtList,
  type CommandFailed,
  type ListUnreadable,
  type ShellError,
} from "./shell.ts";

export interface SettingsFiles {
  /** The mod's own settings file. */
  readonly path: string;
  /** Its name, for messages. */
  readonly name: string;
  /** The old `worktrunk` mod's settings file, only ever read. */
  readonly legacyPath: string;
}

export interface LoadedSettings {
  readonly parsed: ParsedSettings;
  /** The one-time import is over for good (see `planImport`); record it. */
  readonly settled: boolean;
}

/**
 * The settings, read from `files.path`, after the one-time import of the old mod's
 * settings when there is no settings file yet and the import isn't `settled`.
 */
export const loadSettings = Effect.fn("loadSettings")(
  function* (files: SettingsFiles, settled: boolean) {
    const disk = yield* Files;
    // No file is a normal state: the defaults apply.
    const readOrNull = (path: string) =>
      disk.read(path).pipe(Effect.catchTag("FileMissing", () => Effect.succeed(null)));
    const text = yield* readOrNull(files.path);
    const legacy = text === null && !settled ? yield* readOrNull(files.legacyPath) : null;
    const plan = planImport(text, legacy, settled);
    const loaded = (now: string | null): LoadedSettings => ({
      parsed: parseSettings(now, files.name),
      settled: plan.settled,
    });
    if (Option.isNone(plan.write)) return loaded(text);
    const created = yield* Effect.result(disk.create(files.path, plan.write.value));
    if (Result.isSuccess(created)) return loaded(plan.write.value);
    if (created.failure._tag === "FileError") {
      const what = `${files.name}: couldn't create it from ${lastSegment(files.legacyPath)}`;
      return defaultsBecause(what, created.failure, false);
    }
    // A settings file appeared meanwhile: it is the one to use, and the import is moot.
    return loaded(yield* readOrNull(files.path));
  },
  // A file that can't be read leaves the panel on the defaults, saying why.
  (effect, _files, settled) =>
    effect.pipe(
      Effect.catchTag("FileError", (failed) =>
        Effect.succeed(
          defaultsBecause(`${lastSegment(failed.path)}: couldn't read it`, failed, settled),
        ),
      ),
    ),
);

const defaultsBecause = (what: string, failed: FileError, settled: boolean): LoadedSettings => ({
  parsed: {
    settings: DEFAULT_SETTINGS,
    error: Option.some(`${what} (${causeText(failed.cause)})`),
  },
  settled,
});

/** An effect's failure as its one-line reason, so the effect itself never fails. */
const asReason = <A, R>(
  effect: Effect.Effect<A, ShellError | CommandFailed | ListUnreadable, R>,
): Effect.Effect<Result.Result<A, string>, never, R> =>
  effect.pipe(Effect.result, Effect.map(Result.mapError(failureText)));

export interface Found {
  /** What the folder scan found (this time, or the last time when none was due). */
  readonly scanned: readonly FoundRepo[];
  /** The repos to list: scanned and open spaces' repos, grouped, by name. */
  readonly repos: readonly Repo[];
}

/**
 * The repos to list: the folder scan's (run again only when `lastScan` is none) plus the
 * repos the open spaces are in (`places`). A failure is its one-line reason.
 */
export const findRepos = Effect.fn("findRepos")(function* (
  settings: Settings,
  home: string,
  places: readonly string[],
  lastScan: Option.Option<readonly FoundRepo[]>,
) {
  const scanned = Option.isSome(lastScan) ? lastScan.value : yield* scanRepos(settings, home);
  const owners = yield* reposOf(places);
  const found: Found = { scanned, repos: reposFrom(scanned, owners, settings.folders, home) };
  return found;
}, asReason);

/** The worktrees of the repo at `root`, or the one-line reason the read failed. */
export const readList = Effect.fn("readList")(function* (root: string) {
  return yield* wtList(root);
}, asReason);

/** The worktrees of the repo at `root` with their CI, or the one-line reason the read failed. */
export const readCi = Effect.fn("readCi")(function* (root: string) {
  return yield* wtCi(root);
}, asReason);

/**
 * Runs `read` on every repo root, at most `limit` at a time, handing each answer to
 * `keep` as it lands. Each read spawns processes, and Herdr runs out of open files when
 * every repo's list and CI start at once.
 */
export const readEach = <A, R>(
  roots: readonly string[],
  limit: number,
  read: (root: string) => Effect.Effect<A, never, R>,
  keep: (root: string, answer: A) => void,
): Effect.Effect<void, never, R> =>
  Effect.forEach(
    roots,
    (root) => read(root).pipe(Effect.tap((answer) => Effect.sync(() => keep(root, answer)))),
    { concurrency: limit, discard: true },
  );

/**
 * The "run herdr:sync" toast to show, from the sync record at `path`, the installed Herdr
 * version and the version the toast was last shown for (see `syncNotice`).
 */
export const syncToast = Effect.fn("syncToast")(function* (
  path: string,
  installed: string,
  told: unknown,
) {
  const disk = yield* Files;
  // No record, or one that can't be read, means no toast: the sync is optional.
  const record = yield* Effect.option(disk.read(path));
  return syncNotice(record, installed, told);
});
