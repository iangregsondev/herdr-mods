// Running programs through Herdr's `exec`, as Effects with tagged errors. Pure: `herdr`
// is imported as a type only (erased at build), and the real API is handed to the
// layer by main.ts, so tests build the layer from a fake.
import { Context, Data, Effect, Layer, Option } from "effect";
import type * as herdr from "herdr";
import {
  BRANCHES_SCRIPT,
  BRANCH_SCRIPT,
  CI_SCRIPT,
  GONE_SCRIPT,
  jobArgs,
  startedAddress,
  waitResult,
  type Job,
  LIST_SCRIPT,
  OWNERS_SCRIPT,
  SCAN_SCRIPT,
  scanArgs,
  shArgs,
} from "./commands.ts";
import { parseBranches } from "./dialog.ts";
import { THIS_MACHINE } from "./machines.ts";
import { currentRepo, parseOwners, parseScan, type FoundRepo } from "./repos.ts";
import type { Settings } from "./settings.ts";
import { parseList } from "./worktrees.ts";

/** The parts of Herdr's API this service calls. */
export type ExecApi = Pick<typeof herdr, "exec" | "hc">;

/** The promise rejected: the program couldn't start (not installed, no such folder). */
export class ShellError extends Data.TaggedError("ShellError")<{ readonly cause: unknown }> {}

/** `wt list` printed something that isn't its JSON list of worktrees. */
export class ListUnreadable extends Data.TaggedError("ListUnreadable")<{
  readonly message: string;
}> {}

/** The program ran and exited non-zero. `command` names it in messages. */
export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly command: string;
  readonly code: number;
  readonly stderr: string;
}> {}

export interface ExecOptions {
  readonly cwd?: string;
  /** In ms; Herdr's default is 30 seconds. */
  readonly timeout?: number;
}

export class Shell extends Context.Service<
  Shell,
  {
    /** Calls Herdr's API; a rejected promise becomes `ShellError`. Nothing else is checked. */
    readonly use: <A>(fn: (api: ExecApi) => Promise<A>) => Effect.Effect<A, ShellError>;
    /** Runs `command`; a run that exits non-zero is `CommandFailed`. */
    readonly exec: (
      command: string,
      args: readonly string[],
      options?: ExecOptions,
    ) => Effect.Effect<herdr.ExecResult, ShellError | CommandFailed>;
    /**
     * Runs `hc` (herdr-core). Its answer comes back whatever its exit code: callers read
     * its JSON output, which says what happened.
     */
    readonly hc: (args: readonly string[]) => Effect.Effect<herdr.ExecResult, ShellError>;
  }
>()("iangregsondev-worktrunk/Shell") {
  static readonly layer = (api: ExecApi) => {
    // No `signal` parameter: Herdr's runtime has no AbortController.
    const use = <A>(fn: (api: ExecApi) => Promise<A>): Effect.Effect<A, ShellError> =>
      Effect.tryPromise({ try: () => fn(api), catch: (cause) => new ShellError({ cause }) });
    const exec = Effect.fn("Shell.exec")(function* (
      command: string,
      args: readonly string[],
      options?: ExecOptions,
    ) {
      const run = yield* use((herdr) => herdr.exec(command, [...args], options));
      if (run.code !== 0) {
        return yield* new CommandFailed({ command, code: run.code, stderr: run.stderr });
      }
      return run;
    });
    const hc = (args: readonly string[]) => use((herdr) => herdr.hc([...args]));
    return Layer.succeed(Shell, Shell.of({ use, exec, hc }));
  };
}

/** The longest a script may run, in ms. */
const SCRIPT_TIMEOUT = 60_000;

/**
 * Runs `body` under `sh` with `args` as $1..., for up to `timeout` ms; a failure names
 * the run `label`.
 */
export const runScript = Effect.fn("runScript")(function* (
  label: string,
  body: string,
  args: readonly string[],
  timeout: number = SCRIPT_TIMEOUT,
) {
  const shell = yield* Shell;
  return yield* shell
    .exec("sh", shArgs(body, args), { timeout })
    .pipe(
      Effect.catchTag("CommandFailed", (failed) =>
        Effect.fail(
          new CommandFailed({ command: label, code: failed.code, stderr: failed.stderr }),
        ),
      ),
    );
});

/** The worktrees `body` prints for the repo at `root`, its run named `label`. */
const worktreesFrom = Effect.fnUntraced(function* (
  label: string,
  body: string,
  root: string,
  timeout?: number,
) {
  const run = yield* runScript(label, body, [root], timeout);
  return yield* Effect.fromResult(parseList(run.stdout)).pipe(
    Effect.mapError((message) => new ListUnreadable({ message })),
  );
});

/** The worktrees of the repo at `root`, from `wt list --format=json`. */
export const wtList = Effect.fn("wtList")(function* (root: string) {
  return yield* worktreesFrom("wt list", LIST_SCRIPT, root);
});

/** `--full` asks the forge for every branch's checks: slow when cold or rate limited. */
const CI_TIMEOUT = 240_000;

/** The worktrees of the repo at `root` with their CI, from `wt list --full`. */
export const wtCi = Effect.fn("wtCi")(function* (root: string) {
  return yield* worktreesFrom("wt list --full", CI_SCRIPT, root, CI_TIMEOUT);
});

/** The repos the folder scan finds in the settings' group folders. */
export const scanRepos = Effect.fn("scanRepos")(function* (settings: Settings, home: string) {
  if (settings.folders.length === 0) return [];
  const run = yield* runScript("the folder scan", SCAN_SCRIPT, scanArgs(settings, home));
  return parseScan(run.stdout, THIS_MACHINE);
});

/** The repos the given folders are in (each once); none for no folders. */
export const reposOf = Effect.fn("reposOf")(function* (folders: readonly string[]) {
  if (folders.length === 0) return [];
  const run = yield* runScript("the open spaces' repos", OWNERS_SCRIPT, folders);
  return parseOwners(run.stdout, THIS_MACHINE);
});

/**
 * The repo the folder `folder` is in (the Current repo of the focused folder), through
 * its shared git folder, so a linked worktree names its repo; none outside every repo.
 */
export const repoAt = Effect.fn("repoAt")(function* (folder: string) {
  if (folder === "") return Option.none<FoundRepo>();
  const run = yield* runScript("the Current repo's lookup", OWNERS_SCRIPT, [folder]);
  return currentRepo(run.stdout, THIS_MACHINE);
});

/** The local and origin branches of the repo at `root`, for the New-or-open dialog. */
export const gitBranches = Effect.fn("gitBranches")(function* (root: string) {
  const run = yield* runScript("the branch list", BRANCHES_SCRIPT, [root]);
  return parseBranches(run.stdout);
});

/** The branch the folder `folder` is on; none when its HEAD is detached. */
export const branchAt = Effect.fn("branchAt")(function* (folder: string) {
  const run = yield* runScript("the branch lookup", BRANCH_SCRIPT, [folder]);
  return Option.liftPredicate(run.stdout.trim(), (branch) => branch !== "");
});

/** What the panel says about a failed run: one line. */
export const failureText = (error: ShellError | CommandFailed | ListUnreadable): string => {
  switch (error._tag) {
    case "CommandFailed":
      return lastLine(error.stderr) || `${error.command} failed (exit ${error.code})`;
    case "ShellError":
      return `couldn't start: ${causeText(error.cause)}`;
    case "ListUnreadable":
      return error.message;
  }
};

/** A rejection's reason as text. */
export const causeText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** The last line of `text` that has anything on it; empty when none does. */
const lastLine = (text: string): string => text.trim().split("\n").filter(Boolean).at(-1) ?? "";

/** The person's login shell, from `$SHELL`; `/bin/sh` when that can't be read. */
export const loginShell = Effect.fn("loginShell")(function* () {
  const shell = yield* Shell;
  const out = yield* shell.exec("sh", ["-c", 'printf %s "$SHELL"']).pipe(
    Effect.map((run) => run.stdout),
    // Any shell will do to run a job; the person's own is only preferred.
    Effect.orElseSucceed(() => ""),
  );
  return out.trim() || "/bin/sh";
});

/** `hc run` printed no terminal address: the job never started. `reason` says why. */
export class JobNotStarted extends Data.TaggedError("JobNotStarted")<{
  readonly reason: string;
}> {}

/** Starts `job` as a background terminal; its address, for waiting on and stopping it. */
export const startJob = Effect.fn("startJob")(function* (job: Job) {
  const shell = yield* Shell;
  const run = yield* shell.hc(jobArgs(job));
  return yield* Effect.fromOption(startedAddress(run.stdout)).pipe(
    Effect.mapError(
      () => new JobNotStarted({ reason: lastLine(run.stderr) || "hc printed no terminal address" }),
    ),
  );
});

/**
 * Waits for the job in terminal `addr` to end: its exit code; none when it was lost (its
 * terminal is gone, or hc gave no answer). Each wait is hc's own, a minute at most, so
 * nothing here waits on a clock Herdr doesn't have.
 */
export const waitForJob = (addr: string): Effect.Effect<Option.Option<number>, ShellError, Shell> =>
  Effect.gen(function* () {
    const shell = yield* Shell;
    const run = yield* shell.hc(["wait", addr, "--json", "--timeout", "60"]);
    const seen = waitResult(run.stdout);
    switch (seen._tag) {
      case "Ended":
        return Option.some(seen.code);
      case "Lost":
        return Option.none();
      case "Running":
        return yield* waitForJob(addr);
    }
  });

/** Which of `folders` no longer exist. */
export const goneFolders = Effect.fn("goneFolders")(function* (folders: readonly string[]) {
  if (folders.length === 0) return [];
  const run = yield* runScript("the removed folders' check", GONE_SCRIPT, folders);
  return run.stdout.split("\n").filter((line) => line !== "");
});

/** Stops the job in terminal `addr`. */
export const stopJob = Effect.fn("stopJob")(function* (addr: string) {
  const shell = yield* Shell;
  yield* shell.hc(["kill", addr]);
});

/** Shows `path` in the Finder. */
export const reveal = Effect.fn("reveal")(function* (path: string) {
  const shell = yield* Shell;
  yield* shell.exec("open", [path]);
});

/** A new private temp folder (`mktemp -d`), for a job's answer file. */
export const makeTempDir = Effect.fn("makeTempDir")(function* () {
  const shell = yield* Shell;
  const run = yield* shell.exec("mktemp", ["-d"]);
  const dir = run.stdout.trim();
  if (dir === "") {
    return yield* new CommandFailed({
      command: "mktemp",
      code: 0,
      stderr: "mktemp printed no folder",
    });
  }
  return dir;
});

/** Removes the folder at `dir` and everything in it. */
export const removeDir = Effect.fn("removeDir")(function* (dir: string) {
  const shell = yield* Shell;
  yield* shell.exec("rm", ["-rf", dir]);
});

/** Removes the ended job's terminal from herdr-core. */
export const removeTerminal = Effect.fn("removeTerminal")(function* (addr: string) {
  const shell = yield* Shell;
  yield* shell.hc(["rm", addr]);
});
