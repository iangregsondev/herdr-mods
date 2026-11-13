// What a root script's run function gives back, and the CLI tail that prints it. A run
// function never fails: every failure is a result, so the CLI part only prints and exits.
import { Effect } from "effect";

/** What to print and the exit code. */
export interface ScriptResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Exit 1 with each of `lines` on stderr, one per line, each after `prefix` and a space. */
export const scriptFailure = (prefix: string, lines: ReadonlyArray<string>): ScriptResult => ({
  code: 1,
  stdout: "",
  stderr: lines.map((line) => `${prefix} ${line}\n`).join(""),
});

/** Runs `program`, prints its result's stdout and stderr, and sets the exit code. */
export const runMain = async (program: Effect.Effect<ScriptResult>): Promise<void> => {
  const result = await Effect.runPromise(program);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
};
