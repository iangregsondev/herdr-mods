// The panel's reads as Effect programs over the Files and Shell services: settings (with
// the one-time import of the old mod's file), the repos, and each repo's worktrees.
// Every failure the panel can show comes back as a value, so main.ts only runs these and
// keeps what they return. Pure: no `herdr` or `gpui` imports.
import { Data, Effect, Option, Result } from "effect";
import { newScript, switchedTo } from "./commands.ts";
import { Files, type FileError } from "./files.ts";
import type { JobSpec } from "./menus.ts";
import {
  DEFAULT_SETTINGS,
  lastSegment,
  parseSettings,
  hideRepo,
  planImport,
  type ParsedSettings,
  type Settings,
} from "./settings.ts";
import { reposFrom, withoutHidden, type FoundRepo, type Repo } from "./repos.ts";
import { syncNotice } from "./sync.ts";
import {
  causeText,
  failureText,
  goneFolders,
  JobNotStarted,
  loginShell,
  makeTempDir,
  removeDir,
  removeTerminal,
  repoAt,
  reposOf,
  scanRepos,
  startJob,
  waitForJob,
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
  /** The repos to list: scanned and open spaces' repos, grouped, by name, none hidden. */
  readonly repos: readonly Repo[];
}

/**
 * The repos to list: the folder scan's (run again only when `lastScan` is none) plus the
 * repos the open spaces are in (`places`) and the Current repo (`current`), less the
 * hidden ones. A failure is its one-line reason.
 */
export const findRepos = Effect.fn("findRepos")(function* (
  settings: Settings,
  home: string,
  places: readonly string[],
  lastScan: Option.Option<readonly FoundRepo[]>,
  current: Option.Option<FoundRepo> = Option.none(),
) {
  const scanned = Option.isSome(lastScan) ? lastScan.value : yield* scanRepos(settings, home);
  const owners = yield* reposOf(places);
  const repos = reposFrom(scanned, [...owners, ...Option.toArray(current)], settings.folders, home);
  const found: Found = { scanned, repos: withoutHidden(repos, settings.hidden) };
  return found;
}, asReason);

/**
 * The Current repo: the repo `folder` (the focused folder; empty for none) is in, if any,
 * or the one-line reason the lookup failed.
 */
export const lookUpCurrent = Effect.fn("lookUpCurrent")(function* (folder: string) {
  return yield* repoAt(folder);
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

/** The settings file doesn't parse, so it is never written over; `reason` says why. */
export class SettingsBroken extends Data.TaggedError("SettingsBroken")<{
  readonly reason: string;
}> {}

/**
 * Hides the repo at `root` in the settings file (`files.path`), never over a hand edit
 * made since it was read. The answer is the one-line reason it couldn't, if it couldn't.
 */
export const hideInSettings = Effect.fn("hideInSettings")(
  function* (files: Pick<SettingsFiles, "path" | "name">, root: string) {
    const disk = yield* Files;
    const current = yield* disk
      .read(files.path)
      .pipe(Effect.catchTag("FileMissing", () => Effect.succeed(null)));
    const next = yield* Effect.fromResult(hideRepo(current, root, files.name)).pipe(
      Effect.mapError((reason) => new SettingsBroken({ reason })),
    );
    if (next === current) return Result.succeed(undefined);
    yield* current === null
      ? disk.create(files.path, next)
      : disk.replace(files.path, next, current);
    const answer: Result.Result<void, string> = Result.succeed(undefined);
    return answer;
  },
  (effect, files) =>
    effect.pipe(
      Effect.catchTags({
        SettingsBroken: (broken) => Effect.succeed(Result.fail(broken.reason)),
        WriteConflict: () =>
          Effect.succeed(Result.fail(`${files.name} changed while hiding the repo: try again.`)),
        FileError: (failed) =>
          Effect.succeed(
            Result.fail(`${files.name}: couldn't save it (${causeText(failed.cause)})`),
          ),
      }),
    ),
);

/** How a job went. */
export type JobOutcome =
  /** It never started; `reason` says why. */
  | { readonly _tag: "NotStarted"; readonly reason: string }
  /**
   * It ended: its exit code, none when its terminal was lost. `gone` is which of the
   * job's folders no longer exist, so the spaces on them can close.
   */
  | {
      readonly _tag: "Ended";
      readonly code: Option.Option<number>;
      readonly gone: readonly string[];
    };

/**
 * Runs `spec` as a job in the person's login shell, in a background terminal: `shown`
 * gets its address as soon as it starts (to open its window), then this waits for it to
 * end, removes its terminal and checks which of its folders are gone.
 */
export const runJob = Effect.fn("runJob")(
  function* (spec: JobSpec, shown: (addr: string) => void) {
    const shell = yield* loginShell();
    const addr = yield* startJob({ cwd: spec.cwd, shell, body: spec.body });
    yield* Effect.sync(() => shown(addr));
    // Once started, the job runs on in its window whatever hc says: a wait or a removal
    // that fails only loses track of it.
    const code = yield* waitForJob(addr).pipe(Effect.orElseSucceed(() => Option.none<number>()));
    yield* Effect.ignore(removeTerminal(addr));
    // A check that fails can't tell which folders went, so no space is closed.
    const gone = yield* goneFolders(spec.gone).pipe(Effect.orElseSucceed(() => []));
    const outcome: JobOutcome = { _tag: "Ended", code, gone };
    return outcome;
  },
  Effect.catchTags({
    JobNotStarted: (failed) =>
      Effect.succeed<JobOutcome>({ _tag: "NotStarted", reason: failed.reason }),
    ShellError: (failed) =>
      Effect.succeed<JobOutcome>({ _tag: "NotStarted", reason: failureText(failed) }),
  }),
);

/** What the new worktree job did: how it went, and the worktree wt switched to, if any. */
export interface NewOutcome {
  readonly outcome: JobOutcome;
  readonly switched: Option.Option<{ readonly branch: string; readonly path: string }>;
}

/**
 * Switches to or creates the worktree for `name` in the repo at `main` as a job (see
 * `runJob`), its JSON answer written to a private temp folder that is removed after.
 */
export const newWorktree = Effect.fn("newWorktree")(
  function* (
    target: { readonly main: string; readonly name: string; readonly base: string | null },
    shown: (addr: string) => void,
  ) {
    const disk = yield* Files;
    const dir = yield* makeTempDir().pipe(
      Effect.mapError(
        (failed) =>
          new JobNotStarted({ reason: `couldn't make a temp folder: ${failureText(failed)}` }),
      ),
    );
    const out = `${dir}/switch.json`;
    const spec: JobSpec = {
      title: `New worktree ${target.name}`,
      cwd: target.main,
      body: newScript({ ...target, base: Option.fromNullishOr(target.base), out }),
      gone: [],
    };
    const outcome = yield* runJob(spec, shown);
    const succeeded = outcome._tag === "Ended" && Option.contains(outcome.code, 0);
    // Only a job that succeeded wrote an answer worth reading.
    const text = succeeded ? yield* Effect.option(disk.read(out)) : Option.none<string>();
    // A temp folder left behind is harmless: the system clears its temp folders.
    yield* Effect.ignore(removeDir(dir));
    const answer: NewOutcome = { outcome, switched: Option.flatMap(text, switchedTo) };
    return answer;
  },
  Effect.catchTag("JobNotStarted", (failed) =>
    Effect.succeed<NewOutcome>({
      outcome: { _tag: "NotStarted", reason: failed.reason },
      switched: Option.none(),
    }),
  ),
);
