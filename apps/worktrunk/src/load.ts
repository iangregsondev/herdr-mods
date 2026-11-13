// The panel's reads as Effect programs over the Files and Shell services: settings (with
// the one-time import of the old mod's file), the repos, and each repo's worktrees.
// Every failure the panel can show comes back as a value, so main.ts only runs these and
// keeps what they return. Pure: no `herdr` or `gpui` imports.
import { Data, Effect, Option, Result } from "effect";
import { newScript, switchedTo } from "./commands.ts";
import type { Branch, DialogMode, DialogProps } from "./dialog.ts";
import { Files, type FileError, type FileMissing } from "worktrunk-mailbox";
import { spaceWorktreeAction, type Action, type JobSpec } from "./menus.ts";
import {
  machineName,
  repoKey,
  statusOf,
  THIS_MACHINE,
  type Homes,
  type Located,
  type Machine,
  type MachineStates,
  type MachineStatus,
  type RepoId,
} from "./machines.ts";
import {
  addFolderOn,
  DEFAULT_SETTINGS,
  expandHome,
  lastSegment,
  parseSettings,
  hideRepo,
  planImport,
  planSave,
  type ParsedSettings,
  type Settings,
} from "./settings.ts";
import { reposFrom, withoutHidden, type FoundRepo, type Repo, type Scan } from "./repos.ts";
import type { MachineLists } from "./reads.ts";
import { syncNotice, type Notice } from "./sync.ts";
import {
  branchAt,
  causeText,
  failureText,
  gitBranches,
  goneFolders,
  isFolder,
  JobNotStarted,
  loginShell,
  machineHome,
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
  wtLists,
  type CommandFailed,
  type ListUnreadable,
  type Shell,
  type ShellError,
} from "./shell.ts";
import type { Worktree } from "./worktrees.ts";

export interface SettingsFiles {
  /** The mod's own settings file. */
  readonly path: string;
  /** Its name, for messages. */
  readonly name: string;
  /** The old `worktrunk` mod's settings file: read once, and deleted once imported. */
  readonly legacyPath: string;
}

export interface LoadedSettings {
  readonly parsed: ParsedSettings;
  /** The one-time import is over for good (see `planImport`); record it. */
  readonly settled: boolean;
  /** Why the old mod's file is still there after it was imported; none when it went. */
  readonly leftover: Option.Option<string>;
}

/**
 * The settings, read from `files.path`, after the one-time import of the old mod's
 * settings when there is no settings file yet and the import isn't `settled`. A
 * successful import deletes the old file; a failed one leaves it.
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
      leftover: Option.none(),
    });
    if (Option.isNone(plan.write)) return loaded(text);
    const created = yield* Effect.result(disk.create(files.path, plan.write.value));
    if (Result.isSuccess(created)) {
      // The old settings now live in the new file, so the old file goes. One that stays
      // is only clutter: the import still counts, and the panel says why it stayed.
      const removed = yield* Effect.result(disk.remove(files.legacyPath));
      const imported = loaded(plan.write.value);
      if (Result.isSuccess(removed)) return imported;
      const why = `${lastSegment(files.legacyPath)}: imported, but couldn't delete it (${causeText(removed.failure.cause)})`;
      const kept: LoadedSettings = { ...imported, leftover: Option.some(why) };
      return kept;
    }
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
  leftover: Option.none(),
});

/** An effect's failure as its one-line reason, so the effect itself never fails. */
const asReason = <A, R>(
  effect: Effect.Effect<A, ShellError | CommandFailed | ListUnreadable, R>,
): Effect.Effect<Result.Result<A, string>, never, R> =>
  effect.pipe(Effect.result, Effect.map(Result.mapError(failureText)));

/** A folder scan of every machine with group folders, and the homes it read there. */
export interface Scanned extends Scan {
  /** Each scanned machine's home, which a group folder's `~` means there. */
  readonly homes: Homes;
  /** The machines this scan covers; one it lacks (down when it ran) is scanned next time. */
  readonly machines: readonly Machine[];
}

export interface Found {
  /** What the folder scan found (this time, or the last time when none was due). */
  readonly scanned: Scanned;
  /** The repos to list: scanned and open spaces' repos, grouped, by name, none hidden. */
  readonly repos: readonly Repo[];
  /** The machines that couldn't be read, and why: their repos are left out. */
  readonly statuses: ReadonlyMap<Machine, MachineStatus>;
}

/** What the search found on one machine: its scan (when one ran) and its open spaces' repos. */
export interface MachineFound {
  readonly machine: Machine;
  /** Its home, read for the scan; none when no scan ran there. */
  readonly home: Option.Option<string>;
  readonly scan: Scan;
  readonly owners: readonly FoundRepo[];
}

/**
 * Searches `machine`: scans its group folders when `scan` says to (after reading its
 * home there; this machine's is `home`), else keeps the scan of its `last` search, and
 * looks up the repos its open spaces (`places`) are in.
 */
const searchOn = Effect.fnUntraced(function* (
  settings: Settings,
  machine: Machine,
  home: string,
  places: readonly Located[],
  scan: boolean,
  last: Option.Option<MachineFound>,
) {
  const scans = scan && settings.folders.some((folder) => folder.machine === machine);
  const found = !scans
    ? Option.flatMap(last, (before) => before.home)
    : Option.some(machine === THIS_MACHINE ? home : yield* machineHome(machine));
  const scanned: Scan = scans
    ? yield* scanRepos(settings, machine, new Map([[machine, Option.getOrElse(found, () => home)]]))
    : Option.match(last, {
        onNone: (): Scan => ({ repos: [], missing: [] }),
        onSome: (before) => before.scan,
      });
  const owners = yield* reposOf(
    places.filter((place) => place.machine === machine).map((place) => place.folder),
    machine,
  );
  const answer: MachineFound = { machine, home: found, scan: scanned, owners };
  return answer;
});

/** One machine's search: what it found, or why it couldn't be searched. */
export type MachineSearch = Result.Result<MachineFound, MachineStatus>;

/** Each machine's latest search. */
export type Searches = ReadonlyMap<Machine, MachineSearch>;

/** What a refresh searches, and what it remembers from the last. */
export interface MachinesAsk {
  readonly settings: Settings;
  /** This machine's home. */
  readonly home: string;
  /** The open spaces' folders, each on its machine. */
  readonly places: readonly Located[];
  /** Each machine's last search: one not scanned again keeps its scan. */
  readonly last: Searches;
  /** The group folders are scanned again on every machine, not only those never scanned. */
  readonly rescan: boolean;
  /** Herdr's machine list: a machine connecting or unavailable runs nothing. */
  readonly states: MachineStates;
  /** The machines still busy with an earlier refresh: they run nothing now. */
  readonly busy: ReadonlySet<Machine>;
}

/** The machines a search covers: those with group folders, and those with open spaces. */
export const machinesOf = (settings: Settings, places: readonly Located[]): readonly Machine[] =>
  Array.from(
    new Set([...settings.folders.map((folder) => folder.machine), ...places.map((p) => p.machine)]),
  );

/**
 * `machine`'s search, or the status saying why it couldn't run there: its state in
 * `states`, or its failure, a bug included. A machine never scanned (or every machine,
 * when `rescan`) scans its group folders.
 */
const searchMachine = (
  ask: MachinesAsk,
  machine: Machine,
): Effect.Effect<MachineSearch, never, Shell> => {
  const held = statusOf(ask.states, machine);
  if (Option.isSome(held)) return Effect.succeed(Result.fail(held.value));
  const last = Option.flatMap(Option.fromNullishOr(ask.last.get(machine)), Result.getSuccess);
  const scan = ask.rescan || !Option.exists(last, (before) => Option.isSome(before.home));
  return searchOn(ask.settings, machine, ask.home, ask.places, scan, last).pipe(
    Effect.map((found): MachineSearch => Result.succeed(found)),
    Effect.catch((failed) =>
      Effect.succeed<MachineSearch>(Result.fail({ _tag: "Down", reason: failureText(failed) })),
    ),
    Effect.catchDefect((defect) =>
      Effect.succeed<MachineSearch>(Result.fail({ _tag: "Down", reason: defectText(defect) })),
    ),
  );
};

/**
 * One refresh of every machine in `ask` not busy, side by side: each machine's search,
 * handed to `onSearch` as it lands, which answers with that machine's repos to read; then
 * those repos' lists in one batched read, handed to `onLists`; then `onDone`, however the
 * machine's refresh ended. No machine waits on another. A machine whose search failed
 * reads no lists; this machine's lists are read even then, from the repos it kept.
 */
export const refreshMachines = (
  ask: MachinesAsk,
  onSearch: (machine: Machine, search: MachineSearch) => readonly RepoId[],
  onLists: (machine: Machine, answer: MachineLists) => void,
  onDone: (machine: Machine) => void = () => undefined,
): Effect.Effect<void, never, Shell> =>
  Effect.forEach(
    machinesOf(ask.settings, ask.places).filter((machine) => !ask.busy.has(machine)),
    (machine) =>
      searchMachine(ask, machine).pipe(
        Effect.flatMap((search) =>
          Effect.sync(() => onSearch(machine, search)).pipe(
            Effect.flatMap((repos) =>
              readLists(
                repos.filter((repo) => repo.machine === machine),
                machine !== THIS_MACHINE && Result.isFailure(search)
                  ? new Map([[machine, search.failure]])
                  : new Map(),
                onLists,
              ),
            ),
          ),
        ),
        Effect.ensuring(Effect.sync(() => onDone(machine))),
      ),
    { concurrency: "unbounded", discard: true },
  );

/** The searches so far, and why this machine's last search failed, if it did. */
export interface Landed {
  readonly searches: Searches;
  readonly error: Option.Option<string>;
  /** The machines that couldn't be searched, and why: their repos are left out. */
  readonly statuses: ReadonlyMap<Machine, MachineStatus>;
}

/**
 * `search` of `machine` landed. Another machine's failure is its status; this machine's
 * is the error, and its last search that worked stays, so its repos stay listed. A
 * search that works clears the machine's status, one a failed list read gave included.
 */
export const landSearch = (landed: Landed, machine: Machine, search: MachineSearch): Landed => {
  const here = machine === THIS_MACHINE;
  const searches = new Map([...landed.searches, [machine, search]]);
  return Result.match(search, {
    onSuccess: (): Landed => ({
      searches,
      error: here ? Option.none() : landed.error,
      statuses: new Map([...landed.statuses].filter(([at]) => at !== machine)),
    }),
    onFailure: (status): Landed =>
      here
        ? { ...landed, error: Option.some(status._tag === "Down" ? status.reason : "connecting") }
        : { ...landed, searches, statuses: new Map([...landed.statuses, [machine, status]]) },
  });
};

/**
 * The repos to list, from each machine's search in `searches` (only the machines `settings`
 * and `places` cover): the folder scans' plus the repos the open spaces are in and the
 * Current repo (`current`), less the hidden ones. A machine whose search failed gives up
 * its repos.
 */
export const foundOf = (
  settings: Settings,
  home: string,
  places: readonly Located[],
  searches: Searches,
  current: Option.Option<FoundRepo> = Option.none(),
): Found => {
  const searched = machinesOf(settings, places).flatMap((machine) =>
    Option.toArray(
      Option.map(Option.fromNullishOr(searches.get(machine)), (result) => ({ machine, result })),
    ),
  );
  const ok = searched.flatMap(({ result }) => Option.toArray(Result.getSuccess(result)));
  const scans = ok.flatMap((found) =>
    Option.toArray(Option.map(found.home, (at) => ({ ...found, home: at }))),
  );
  const scanned: Scanned = {
    repos: scans.flatMap((found) => found.scan.repos),
    missing: scans.flatMap((found) => found.scan.missing),
    homes: new Map([
      [THIS_MACHINE, home],
      ...scans.map((found) => [found.machine, found.home] as const),
    ]),
    machines: scans.map((found) => found.machine),
  };
  const repos = reposFrom(
    scanned.repos,
    [...ok.flatMap((found) => found.owners), ...Option.toArray(current)],
    settings.folders,
    scanned.homes,
  );
  return {
    scanned,
    repos: withoutHidden(repos, settings.hidden),
    statuses: new Map(
      searched.flatMap(({ machine, result }) =>
        Option.toArray(
          Option.map(Result.getFailure(result), (status) => [machine, status] as const),
        ),
      ),
    ),
  };
};

/**
 * The Current repo: the repo `focused` (the focused folder, looked up on its machine;
 * empty for none) is in, if any, or the one-line reason the lookup failed.
 */
export const lookUpCurrent = Effect.fn("lookUpCurrent")(function* (focused: Located) {
  return yield* repoAt(focused.folder, focused.machine);
}, asReason);

/**
 * What the worktree dialog in `mode` opens with, for the repo `at` (a folder on a
 * machine; an empty folder for none) is in: that repo and the branch the folder is on,
 * and the `listed` repos to pick from, by folder name. None when there is no repo at
 * all. A lookup that fails is its one-line reason.
 */
export const dialogFor = Effect.fn("dialogFor")(function* (
  { machine, folder }: Located,
  listed: readonly RepoId[],
  mode: DialogMode = "new",
) {
  const found = yield* repoAt(folder, machine);
  // The branch is offered as a base only in the repo it belongs to.
  const branch = Option.isSome(found) ? yield* branchAt(folder, machine) : Option.none<string>();
  const repos = [...listed].sort((a, b) => lastSegment(a.root).localeCompare(lastSegment(b.root)));
  const props: DialogProps = {
    mode,
    repo: Option.map(found, ({ machine, root }): RepoId => ({ machine, root })),
    branch,
    repos,
  };
  return Option.isNone(found) && repos.length === 0 ? Option.none() : Option.some(props);
}, asReason);

/** What the New-or-open dialog lists for a repo: each read's answer, or why it failed. */
export interface DialogRead {
  readonly list: Result.Result<readonly Worktree[], string>;
  readonly branches: Result.Result<readonly Branch[], string>;
}

/** The worktrees and branches of `repo`, for the New-or-open dialog. */
export const readDialogRepo = (repo: RepoId): Effect.Effect<DialogRead, never, Shell> =>
  Effect.all({ list: readList(repo), branches: readBranches(repo) }, { concurrency: 2 });

/** The branches of `repo`, or the one-line reason the read failed. */
const readBranches = Effect.fn("readBranches")(function* (repo: RepoId) {
  return yield* gitBranches(repo);
}, asReason);

/** The worktrees of `repo`, or the one-line reason the read failed. */
export const readList = Effect.fn("readList")(function* (repo: RepoId) {
  return yield* wtList(repo);
}, asReason);

/**
 * The Merge or Remove a space's menu asks for, of the worktree the space's folder
 * `folder` is in on `machine`: found through its repo and that repo's list, read now on
 * that machine, since the panel may not list the repo (hidden, or outside the group
 * folders). A failure, or a worktree that can't be merged or removed, is its one-line
 * reason.
 */
export const spaceWorktree = (
  act: "Merge" | "Remove",
  { machine, folder }: Located,
): Effect.Effect<Result.Result<Action, string>, never, Shell> =>
  holderRepo(folder, machine).pipe(
    Effect.map(
      Result.flatMap(
        Option.match({
          onNone: () => Result.fail(`${folder} isn't in a git repo.`),
          onSome: ({ repo, worktrees }) => spaceWorktreeAction(act, repo, worktrees, folder),
        }),
      ),
    ),
  );

/** The repo `folder` on `machine` is in, with its worktrees; none outside every repo. */
const holderRepo = Effect.fn("holderRepo")(function* (folder: string, machine: Machine) {
  const found = yield* repoAt(folder, machine);
  if (Option.isNone(found)) return Option.none();
  const worktrees = yield* wtList(found.value);
  return Option.some({ repo: found.value, worktrees });
}, asReason);

/**
 * Reads every repo's worktrees with one batched `wt list` per machine, the machines side
 * by side, handing each machine's answer to `keep` as it lands. A machine in `skip`
 * (connecting, or found down) runs nothing and gets that status.
 */
export const readLists = (
  repos: readonly RepoId[],
  skip: ReadonlyMap<Machine, MachineStatus>,
  keep: (machine: Machine, answer: MachineLists) => void,
): Effect.Effect<void, never, Shell> => {
  const machines = Array.from(new Set(repos.map((repo) => repo.machine)));
  const held = machines.flatMap((machine) =>
    Option.toArray(
      Option.map(Option.fromNullishOr(skip.get(machine)), (status) => [machine, status] as const),
    ),
  );
  return Effect.sync(() =>
    held.forEach(([machine, status]) => keep(machine, Result.fail(status))),
  ).pipe(
    Effect.andThen(
      Effect.forEach(
        machines.filter((machine) => !skip.has(machine)),
        (machine) =>
          machineLists(
            machine,
            repos.filter((repo) => repo.machine === machine).map((repo) => repo.root),
          ).pipe(Effect.tap((answer) => Effect.sync(() => keep(machine, answer)))),
        { concurrency: "unbounded", discard: true },
      ),
    ),
  );
};

/** The batched list read of `roots` on `machine`, keyed by `repoKey`. */
const machineLists = (
  machine: Machine,
  roots: readonly string[],
): Effect.Effect<MachineLists, never, Shell> =>
  wtLists(machine, roots).pipe(
    Effect.map((lists): MachineLists =>
      Result.succeed(
        new Map(Array.from(lists, ([root, list]) => [repoKey({ machine, root }), list])),
      ),
    ),
    Effect.catch((failed) =>
      Effect.succeed<MachineLists>(Result.fail({ _tag: "Down", reason: failureText(failed) })),
    ),
    // A bug in the read is that machine's failure too, so the panel says so.
    Effect.catchDefect((defect) =>
      Effect.succeed<MachineLists>(Result.fail({ _tag: "Down", reason: defectText(defect) })),
    ),
  );

/** A defect, a bug, as its one-line reason. */
export const defectText = (defect: unknown): string => `a bug: ${String(defect)}`;

/** `read`, with a defect, a bug, as its failed answer, so the panel shows it like any other. */
export const defectAsReason = <A, R>(
  read: Effect.Effect<Result.Result<A, string>, never, R>,
): Effect.Effect<Result.Result<A, string>, never, R> =>
  read.pipe(Effect.catchDefect((defect) => Effect.succeed(Result.fail(defectText(defect)))));

/** The worktrees of `repo` with their CI, or the one-line reason the read failed. */
export const readCi = Effect.fn("readCi")(function* (repo: RepoId) {
  return yield* wtCi(repo);
}, asReason);

/**
 * Runs `read` on every repo, at most `limit` at a time, handing each answer to `keep` as
 * it lands. Each read spawns processes, and Herdr runs out of open files when every
 * repo's list and CI start at once.
 */
export const readEach = <T, A, R>(
  repos: readonly T[],
  limit: number,
  read: (repo: T) => Effect.Effect<A, never, R>,
  keep: (repo: T, answer: A) => void,
): Effect.Effect<void, never, R> =>
  Effect.forEach(
    repos,
    (repo) => read(repo).pipe(Effect.tap((answer) => Effect.sync(() => keep(repo, answer)))),
    { concurrency: limit, discard: true },
  );

/**
 * The "run herdr:sync" toast to show, from the sync record at `path`, the installed Herdr
 * version and the version the toast was last shown for (see `syncNotice`). A record that
 * can't be read is its one-line reason.
 */
export const syncToast = Effect.fn("syncToast")(
  function* (path: string, installed: string, told: unknown) {
    const disk = yield* Files;
    // No record means no toast: the sync is optional.
    const record = yield* disk.read(path).pipe(
      Effect.asSome,
      Effect.catchTag("FileMissing", () => Effect.succeed(Option.none<string>())),
    );
    const answer: Result.Result<Option.Option<Notice>, string> = Result.succeed(
      syncNotice(record, installed, told),
    );
    return answer;
  },
  (effect, path) =>
    effect.pipe(
      Effect.catchTag("FileError", (failed) =>
        Effect.succeed(
          Result.fail(`${lastSegment(path)}: couldn't read it (${causeText(failed.cause)})`),
        ),
      ),
    ),
);

/** The settings file doesn't parse, so it is never written over; `reason` says why. */
export class SettingsBroken extends Data.TaggedError("SettingsBroken")<{
  readonly reason: string;
}> {}

/** The settings file couldn't be read, so nothing can be written over it safely. */
export class SettingsUnreadable extends Data.TaggedError("SettingsUnreadable")<{
  readonly cause: unknown;
}> {}

/** The settings file's text now; null when there is none. */
const currentSettings = Effect.fnUntraced(function* (path: string) {
  const disk = yield* Files;
  return yield* disk.read(path).pipe(
    Effect.catchTag("FileMissing", () => Effect.succeed(null)),
    Effect.mapError((failed) => new SettingsUnreadable({ cause: failed.cause })),
  );
});

/** What the panel says about a settings file it couldn't read. */
const unreadableText = (name: string, failed: SettingsUnreadable): string =>
  `${name}: couldn't read it (${causeText(failed.cause)})`;

/** What the panel says about a settings file it couldn't write. */
const unsavedText = (name: string, failed: FileError): string =>
  `${name}: couldn't save it (${causeText(failed.cause)})`;

/**
 * Hides `repo` (by machine and folder) in the settings file (`files.path`), never over a hand edit
 * made since it was read. The answer is the one-line reason it couldn't, if it couldn't.
 */
export const hideInSettings = Effect.fn("hideInSettings")(
  function* (files: Pick<SettingsFiles, "path" | "name">, repo: RepoId) {
    const disk = yield* Files;
    const current = yield* currentSettings(files.path);
    const next = yield* Effect.fromResult(hideRepo(current, repo, files.name)).pipe(
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
        SettingsUnreadable: (failed) =>
          Effect.succeed(Result.fail(unreadableText(files.name, failed))),
        WriteConflict: () =>
          Effect.succeed(Result.fail(`${files.name} changed while hiding the repo: try again.`)),
        FileError: (failed) => Effect.succeed(Result.fail(unsavedText(files.name, failed))),
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
      /** What went wrong after it started, one line each: it ran, but these failed. */
      readonly problems: readonly string[];
    };

/** What the panel says about a file it couldn't read: one line. */
const fileFailureText = (failed: FileMissing | FileError): string =>
  failed._tag === "FileMissing" ? `${failed.path} is missing` : causeText(failed.cause);

/** A step that failed as its one line, `what` went wrong and why; nothing when it worked. */
const problemOf = <A>(
  step: Result.Result<A, ShellError | CommandFailed | ListUnreadable>,
  what: string,
): readonly string[] => (Result.isFailure(step) ? [`${what}: ${failureText(step.failure)}`] : []);

/**
 * Runs `spec` as a job on its machine, in the person's login shell there, in a
 * background terminal: `shown` gets its address as soon as it starts (to open its
 * window), then this waits for it to end, removes its terminal and checks, on that
 * machine, which of its folders are gone.
 */
export const runJob = Effect.fn("runJob")(
  function* (spec: JobSpec, shown: (addr: string) => void) {
    const shell = yield* loginShell(spec.on);
    const addr = yield* startJob({ cwd: spec.cwd, shell, body: spec.body, on: spec.on });
    yield* Effect.sync(() => shown(addr));
    // Once started, the job runs on in its window whatever hc says: a wait that fails
    // loses track of it, with no exit code, and says so.
    const waited = yield* Effect.result(waitForJob(addr));
    const removed = yield* Effect.result(removeTerminal(addr));
    // A check that fails can't tell which folders went, so no space is closed.
    const checked = yield* Effect.result(goneFolders(spec.gone, spec.on));
    const outcome: JobOutcome = {
      _tag: "Ended",
      code: Result.getOrElse(waited, () => Option.none<number>()),
      gone: Result.getOrElse(checked, (): readonly string[] => []),
      problems: [
        ...problemOf(waited, "Lost track of the job"),
        ...problemOf(removed, "Couldn't remove the job's terminal"),
        ...problemOf(checked, "Couldn't check which folders went, so no space was closed"),
      ],
    };
    return outcome;
  },
  (effect, spec) =>
    effect.pipe(
      Effect.catchTags({
        JobNotStarted: (failed) =>
          Effect.succeed<JobOutcome>({ _tag: "NotStarted", reason: failed.reason }),
        ShellError: (failed) =>
          Effect.succeed<JobOutcome>({ _tag: "NotStarted", reason: failureText(failed) }),
        LoginShellUnknown: (failed) =>
          Effect.succeed<JobOutcome>({
            _tag: "NotStarted",
            reason: `couldn't find your login shell: ${failed.reason}`,
          }),
      }),
      Effect.map((outcome) => outcomeOn(spec.on, outcome)),
    ),
);

/** `text` named as `machine`'s, so a failure says where to look; this machine's as is. */
export const onMachineText = (machine: Machine, text: string): string =>
  machine === THIS_MACHINE ? text : `On ${machineName(machine)}: ${text}`;

/** `outcome` with its reason or problems named as `machine`'s. */
const outcomeOn = (machine: Machine, outcome: JobOutcome): JobOutcome =>
  outcome._tag === "NotStarted"
    ? { ...outcome, reason: onMachineText(machine, outcome.reason) }
    : { ...outcome, problems: outcome.problems.map((line) => onMachineText(machine, line)) };

/** What the new worktree job did: how it went, and the worktree wt switched to, if any. */
export interface NewOutcome {
  readonly outcome: JobOutcome;
  readonly switched: Option.Option<{ readonly branch: string; readonly path: string }>;
  /** What went wrong around the job, one line each: reading its answer, removing its temp folder. */
  readonly problems: readonly string[];
}

/** The worktree wt's answer file names, from its `read`, or the one line saying why not. */
const switchedFrom = (
  read: Result.Result<string, FileMissing | FileError>,
): Result.Result<{ readonly branch: string; readonly path: string }, string> =>
  Result.match(read, {
    onFailure: (failed) =>
      Result.fail(`Couldn't read wt's answer, so no space was opened: ${fileFailureText(failed)}`),
    onSuccess: (text) =>
      Result.fromOption(
        switchedTo(text),
        () => `wt's answer names no branch and folder, so no space was opened: ${text.trim()}`,
      ),
  });

/**
 * Switches to or creates the worktree for `name` in the repo at `main` on `machine` as a
 * job (see `runJob`), its JSON answer written to a private temp folder there, read back
 * from there, and removed after. The folder must be on the job's machine: wt writes it
 * there, and Herdr reads files on any machine.
 */
export const newWorktree = Effect.fn("newWorktree")(
  function* (
    target: {
      readonly main: string;
      readonly name: string;
      readonly base: string | null;
      readonly machine: Machine;
    },
    shown: (addr: string) => void,
  ) {
    const disk = yield* Files;
    const dir = yield* makeTempDir(target.machine).pipe(
      Effect.mapError(
        (failed) =>
          new JobNotStarted({ reason: `couldn't make a temp folder: ${failureText(failed)}` }),
      ),
    );
    const out = `${dir}/switch.json`;
    const spec: JobSpec = {
      title: `Open or create ${target.name}`,
      cwd: target.main,
      body: newScript({ ...target, base: Option.fromNullishOr(target.base), out }),
      gone: [],
      on: target.machine,
    };
    const outcome = yield* runJob(spec, shown);
    const succeeded = outcome._tag === "Ended" && Option.contains(outcome.code, 0);
    // Only a job that succeeded wrote an answer worth reading.
    const read = succeeded
      ? Option.some(yield* Effect.result(disk.read(out, target.machine)))
      : Option.none();
    const removed = yield* Effect.result(removeDir(dir, target.machine));
    const switched = Option.map(read, switchedFrom);
    // The job's own outcome already names its machine.
    const answer: NewOutcome = {
      outcome,
      switched: Option.flatMap(switched, Result.getSuccess),
      problems: [
        ...Option.toArray(Option.flatMap(switched, Result.getFailure)),
        ...problemOf(removed, `Couldn't remove the temp folder ${dir}`),
      ].map((line) => onMachineText(target.machine, line)),
    };
    return answer;
  },
  (effect, target) =>
    effect.pipe(
      Effect.catchTag("JobNotStarted", (failed) =>
        Effect.succeed<NewOutcome>({
          outcome: { _tag: "NotStarted", reason: onMachineText(target.machine, failed.reason) },
          switched: Option.none(),
          problems: [],
        }),
      ),
    ),
);

/** The group folder picked in the system's folder picker (none if cancelled), or why it couldn't open. */
export const pickGroupFolder = Effect.fn("pickGroupFolder")(
  function* () {
    const disk = yield* Files;
    const picked = yield* disk.pickFolder("Add group folder");
    const answer: Result.Result<Option.Option<string>, string> = Result.succeed(picked);
    return answer;
  },
  Effect.catchTag("PickerFailed", (failed) =>
    Effect.succeed(Result.fail(`couldn't open the folder picker (${causeText(failed.cause)})`)),
  ),
);

/**
 * The settings with the folder typed as `typed` on `machine` added as a group, once a
 * check run there finds it (`~` is that machine's home, read there). A folder that isn't
 * there, or a check that can't run, is the answer's reason instead: nothing is added.
 */
export const addGroupFolderOn = Effect.fn("addGroupFolderOn")(
  function* (settings: Settings, machine: string, typed: string) {
    const path = typed.trim();
    if (path === "") return Result.fail(`Type the folder's path on ${machine}`);
    const home = yield* machineHome(machine);
    const found = yield* isFolder(expandHome(path, home), machine);
    const answer: Result.Result<Settings, string> = found
      ? Result.succeed(addFolderOn(settings, machine, path, home))
      : Result.fail(`${path} isn't a folder on ${machine}`);
    return answer;
  },
  (effect, _settings, machine, typed) => {
    const cantCheck = (failed: CommandFailed | ShellError) =>
      Effect.succeed(
        Result.fail(`couldn't check ${typed.trim()} on ${machine}: ${failureText(failed)}`),
      );
    return effect.pipe(Effect.catchTags({ CommandFailed: cantCheck, ShellError: cantCheck }));
  },
);

/** The settings file's text for the Settings dialog to open on (null: no file), or why it can't be read. */
export const settingsText = Effect.fn("settingsText")(
  function* (files: Pick<SettingsFiles, "path" | "name">) {
    const answer: Result.Result<string | null, string> = Result.succeed(
      yield* currentSettings(files.path),
    );
    return answer;
  },
  (effect, files) =>
    effect.pipe(
      Effect.catchTag("SettingsUnreadable", (failed) =>
        Effect.succeed(Result.fail(unreadableText(files.name, failed))),
      ),
    ),
);

/** What a save from the Settings dialog did: wrote the file, or found nothing to change. */
export type Saved = "Saved" | "Unchanged";

/** The settings file changed since the Settings dialog opened on it. */
export class SettingsChanged extends Data.TaggedError("SettingsChanged")<{}> {}

const CHANGED_TEXT =
  "The settings file changed since this dialog opened, so nothing was saved. Close and open Settings again to edit the new file.";

/**
 * Saves `settings` from the Settings dialog to the settings file (`files.path`), whose
 * text was `opened` when the dialog opened (null: no file), never over a hand edit made
 * since. The answer is the one-line reason it couldn't, if it couldn't.
 */
export const saveSettings = Effect.fn("saveSettings")(
  function* (
    files: Pick<SettingsFiles, "path" | "name">,
    opened: string | null,
    settings: Settings,
  ) {
    const disk = yield* Files;
    const onDisk = yield* currentSettings(files.path);
    const plan = planSave(opened, onDisk, settings, files.name);
    switch (plan._tag) {
      case "Broken":
        return yield* new SettingsBroken({
          reason: `${plan.error}. Fix the file by hand; Settings can't save over it.`,
        });
      case "Changed":
        return yield* new SettingsChanged();
      case "Write": {
        yield* plan.expected === null
          ? disk.create(files.path, plan.text)
          : disk.replace(files.path, plan.text, plan.expected);
        const saved: Result.Result<Saved, string> = Result.succeed("Saved");
        return saved;
      }
      case "Unchanged": {
        const answer: Result.Result<Saved, string> = Result.succeed("Unchanged");
        return answer;
      }
    }
  },
  (effect, files) =>
    effect.pipe(
      Effect.catchTags({
        SettingsBroken: (broken) => Effect.succeed(Result.fail(broken.reason)),
        SettingsChanged: () => Effect.succeed(Result.fail(CHANGED_TEXT)),
        WriteConflict: () => Effect.succeed(Result.fail(CHANGED_TEXT)),
        SettingsUnreadable: (failed) =>
          Effect.succeed(Result.fail(unreadableText(files.name, failed))),
        FileError: (failed) => Effect.succeed(Result.fail(unsavedText(files.name, failed))),
      }),
    ),
);
