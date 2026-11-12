// Runs `herdr-app` with the given arguments on the dev target's Herdr host: this
// machine for `local`, over SSH for `remote`. Prints its output and exits with its
// exit code, so the same command proves a change in both modes.
//
//   vp run herdr <args…>
import { Effect, Predicate, Result } from "effect";
import { type LoadOptions, loadDevTarget } from "./dev-config.ts";
import { HerdrHost, hostLayer } from "./herdr-host.ts";

/** What to print and the exit code. */
export interface HerdrResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A failure's cause as text: its message when it has one. */
const causeText = (cause: unknown): string =>
  Predicate.hasProperty(cause, "message") ? String(cause.message) : String(cause);

/** Exit 1 with `message` on stderr. */
const failure = (message: string): HerdrResult => ({
  code: 1,
  stdout: "",
  stderr: `herdr: ${message}\n`,
});

/** Runs `herdr-app <args>` on the dev target's Herdr host. Never fails: every failure is a result. */
export const runHerdr = Effect.fn("runHerdr")(function* (
  args: ReadonlyArray<string>,
  options: LoadOptions = {},
): Effect.fn.Return<HerdrResult> {
  const loaded = yield* Effect.result(loadDevTarget(options));
  if (Result.isFailure(loaded)) {
    const error = loaded.failure;
    return failure(
      error._tag === "DevConfigInvalid"
        ? `${error.file}: ${error.field}: ${error.message}`
        : `couldn't read ${error.file} (${causeText(error.cause)})`,
    );
  }
  const target = loaded.success;
  return yield* Effect.gen(function* () {
    const host = yield* HerdrHost;
    const output = yield* host.herdrApp(args);
    return { code: 0, ...output };
  }).pipe(
    Effect.provide(hostLayer(target)),
    Effect.catchTags({
      CommandFailed: ({ code, stdout, stderr }) => Effect.succeed({ code, stdout, stderr }),
      HostUnreachable: (error) => Effect.succeed(failure(error.message)),
      // The shell's exit code for a command that couldn't be run.
      TransportError: ({ operation, cause }) =>
        Effect.succeed({
          ...failure(`couldn't ${operation} (${causeText(cause)})`),
          code: 127,
        }),
    }),
  );
});

if (import.meta.main) {
  const result = await Effect.runPromise(runHerdr(process.argv.slice(2)));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
