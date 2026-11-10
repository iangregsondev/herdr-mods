// Running programs through Herdr's `exec`, as Effects with tagged errors. Pure: `herdr`
// is imported as a type only (erased at build), and the real API is handed to the
// layer by main.ts, so tests build the layer from a fake.
import { Context, Data, Effect, Layer } from "effect";
import type * as herdr from "herdr";
import { LIST_SCRIPT, OWNERS_SCRIPT, SCAN_SCRIPT, scanArgs, shArgs } from "./commands.ts";
import { parseOwners, parseScan } from "./repos.ts";
import type { Settings } from "./settings.ts";
import { parseList } from "./worktrees.ts";

/** The part of Herdr's API this service calls. */
export type ExecApi = Pick<typeof herdr, "exec">;

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
    return Layer.succeed(Shell, Shell.of({ use, exec }));
  };
}

/** The longest a script may run, in ms. */
const SCRIPT_TIMEOUT = 60_000;

/** Runs `body` under `sh` with `args` as $1...; a failure names the run `label`. */
export const runScript = Effect.fn("runScript")(function* (
  label: string,
  body: string,
  args: readonly string[],
) {
  const shell = yield* Shell;
  return yield* shell
    .exec("sh", shArgs(body, args), { timeout: SCRIPT_TIMEOUT })
    .pipe(
      Effect.catchTag("CommandFailed", (failed) =>
        Effect.fail(
          new CommandFailed({ command: label, code: failed.code, stderr: failed.stderr }),
        ),
      ),
    );
});

/** The worktrees of the repo at `root`, from `wt list --format=json`. */
export const wtList = Effect.fn("wtList")(function* (root: string) {
  const run = yield* runScript("wt list", LIST_SCRIPT, [root]);
  return yield* Effect.fromResult(parseList(run.stdout)).pipe(
    Effect.mapError((message) => new ListUnreadable({ message })),
  );
});

/** The repos the folder scan finds in the settings' group folders. */
export const scanRepos = Effect.fn("scanRepos")(function* (settings: Settings, home: string) {
  if (settings.folders.length === 0) return [];
  const run = yield* runScript("the folder scan", SCAN_SCRIPT, scanArgs(settings, home));
  return parseScan(run.stdout);
});

/** The repos the given folders are in (each once); none for no folders. */
export const reposOf = Effect.fn("reposOf")(function* (folders: readonly string[]) {
  if (folders.length === 0) return [];
  const run = yield* runScript("the open spaces' repos", OWNERS_SCRIPT, folders);
  return parseOwners(run.stdout);
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
