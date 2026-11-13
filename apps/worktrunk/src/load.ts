// The panel's reads as Effect programs over the Files and Shell services: settings (with
// the one-time import of the old mod's file), the repos, and each repo's worktrees.
// Every failure the panel can show comes back as a value, so main.ts only runs these and
// keeps what they return. Pure: no `herdr` or `gpui` imports.
import { Data, Effect, Option, Result } from "effect";
import { newScript, switchedTo } from "./commands.ts";
import type { Branch, DialogProps } from "./dialog.ts";
import { Files, type FileError, type FileMissing } from "worktrunk-mailbox";
import { spaceWorktreeAction, type Action, type JobSpec } from "./menus.ts";
import type { RepoId } from "./machines.ts";
import {
  DEFAULT_SETTINGS,
  lastSegment,
  parseSettings,
  hideRepo,
  planImport,
  planSave,
  type ParsedSettings,
  type Settings,
} from "./settings.ts";
import { reposFrom, withoutHidden, type FoundRepo, type Repo } from "./repos.ts";
import { syncNotice } from "./sync.ts";
import {
  branchAt,
  causeText,
  failureText,
  gitBranches,
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

/**
 * What the New-or-open dialog opens with, for the repo `folder` (the focused folder when
 * empty for none) is in: that repo and the branch the folder is on, and the `listed`
 * repos to pick from, by folder name. None when there is no repo at all. A lookup that
 * fails is its one-line reason.
 */
export const dialogFor = Effect.fn("dialogFor")(function* (
  folder: string,
  listed: readonly string[],
) {
  const found = yield* repoAt(folder);
  // The branch is offered as a base only in the repo it belongs to.
  const branch = Option.isSome(found) ? yield* branchAt(folder) : Option.none<string>();
  const repos = [...listed].sort((a, b) => lastSegment(a).localeCompare(lastSegment(b)));
  const props: DialogProps = { repo: Option.map(found, (repo) => repo.root), branch, repos };
  return Option.isNone(found) && repos.length === 0 ? Option.none() : Option.some(props);
}, asReason);

/** What the New-or-open dialog lists for a repo: each read's answer, or why it failed. */
export interface DialogRead {
  readonly list: Result.Result<readonly Worktree[], string>;
  readonly branches: Result.Result<readonly Branch[], string>;
}

/** The worktrees and branches of the repo at `root`, for the New-or-open dialog. */
export const readDialogRepo = (root: string): Effect.Effect<DialogRead, never, Shell> =>
  Effect.all({ list: readList(root), branches: readBranches(root) }, { concurrency: 2 });

/** The branches of the repo at `root`, or the one-line reason the read failed. */
const readBranches = Effect.fn("readBranches")(function* (root: string) {
  return yield* gitBranches(root);
}, asReason);

/** The worktrees of the repo at `root`, or the one-line reason the read failed. */
export const readList = Effect.fn("readList")(function* (root: string) {
  return yield* wtList(root);
}, asReason);

/**
 * The Merge or Remove a space's menu asks for, of the worktree the space's folder
 * `folder` is in: found through its repo and that repo's list, read now, since the panel
 * may not list the repo (hidden, or outside the group folders). A failure, or a worktree
 * that can't be merged or removed, is its one-line reason.
 */
export const spaceWorktree = (
  act: "Merge" | "Remove",
  folder: string,
): Effect.Effect<Result.Result<Action, string>, never, Shell> =>
  holderRepo(folder).pipe(
    Effect.map(
      Result.flatMap(
        Option.match({
          onNone: () => Result.fail(`${folder} isn't in a git repo.`),
          onSome: ({ root, worktrees }) => spaceWorktreeAction(act, root, worktrees, folder),
        }),
      ),
    ),
  );

/** The repo `folder` is in, with its worktrees; none outside every repo. */
const holderRepo = Effect.fn("holderRepo")(function* (folder: string) {
  const found = yield* repoAt(folder);
  if (Option.isNone(found)) return Option.none();
  const root = found.value.root;
  const worktrees = yield* wtList(root);
  return Option.some({ root, worktrees });
}, asReason);

/** The worktrees of the repo at `root` with their CI, or the one-line reason the read failed. */
export const readCi = Effect.fn("readCi")(function* (root: string) {
  return yield* wtCi(root);
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
 * Runs `spec` as a job in the person's login shell, in a background terminal: `shown`
 * gets its address as soon as it starts (to open its window), then this waits for it to
 * end, removes its terminal and checks which of its folders are gone.
 */
export const runJob = Effect.fn("runJob")(
  function* (spec: JobSpec, shown: (addr: string) => void) {
    const shell = yield* loginShell();
    const addr = yield* startJob({ cwd: spec.cwd, shell, body: spec.body });
    yield* Effect.sync(() => shown(addr));
    // Once started, the job runs on in its window whatever hc says: a wait that fails
    // loses track of it, with no exit code, and says so.
    const waited = yield* Effect.result(waitForJob(addr));
    const removed = yield* Effect.result(removeTerminal(addr));
    // A check that fails can't tell which folders went, so no space is closed.
    const checked = yield* Effect.result(goneFolders(spec.gone));
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
);

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
      title: `Open or create ${target.name}`,
      cwd: target.main,
      body: newScript({ ...target, base: Option.fromNullishOr(target.base), out }),
      gone: [],
    };
    const outcome = yield* runJob(spec, shown);
    const succeeded = outcome._tag === "Ended" && Option.contains(outcome.code, 0);
    // Only a job that succeeded wrote an answer worth reading.
    const read = succeeded ? Option.some(yield* Effect.result(disk.read(out))) : Option.none();
    const removed = yield* Effect.result(removeDir(dir));
    const switched = Option.map(read, switchedFrom);
    const answer: NewOutcome = {
      outcome,
      switched: Option.flatMap(switched, Result.getSuccess),
      problems: [
        ...Option.toArray(Option.flatMap(switched, Result.getFailure)),
        ...problemOf(removed, `Couldn't remove the temp folder ${dir}`),
      ],
    };
    return answer;
  },
  Effect.catchTag("JobNotStarted", (failed) =>
    Effect.succeed<NewOutcome>({
      outcome: { _tag: "NotStarted", reason: failed.reason },
      switched: Option.none(),
      problems: [],
    }),
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
