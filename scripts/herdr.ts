// Runs `herdr-app` with the given arguments on the dev target's Herdr host: this
// machine for `local`, over SSH for `remote`. Prints its output and exits with its
// exit code, so the same command proves a change in both modes.
//
//   vp run herdr <args…>
//   vp run herdr shot <file> [--crop x,y,w,h]
//
// `shot` saves a screenshot of the Herdr host's window to <file> on this machine:
// it shoots into a temp folder on the host, crops there with `sips` when --crop is
// given, copies the image back and removes the temp folder.
import { Effect, Option, Predicate, Result } from "effect";
import { type LoadOptions, loadDevTarget } from "./dev-config.ts";
import { CommandFailed, type Crop, HerdrHost, hostLayer } from "./herdr-host.ts";

/** What to print and the exit code. */
export interface HerdrResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A failure's cause as text: a failed command's stderr, else its message when it has one. */
const causeText = (cause: unknown): string =>
  cause instanceof CommandFailed
    ? cause.stderr.trim()
    : Predicate.hasProperty(cause, "message")
      ? String(cause.message)
      : String(cause);

/** Exit 1 with `message` on stderr. */
const failure = (message: string): HerdrResult => ({
  code: 1,
  stdout: "",
  stderr: `herdr: ${message}\n`,
});

/** What `shot` was asked for: where to save the image, and the part of the window to keep. */
export interface ShotRequest {
  readonly file: string;
  readonly crop: Option.Option<Crop>;
}

const SHOT_USAGE = "usage: vp run herdr shot <file> [--crop x,y,w,h]";

/** `x,y,w,h`: four whole numbers, the last two above 0. */
const CROP = /^(\d+),(\d+),(\d+),(\d+)$/;

/** A `--crop` value as a Crop, or a message saying what's wrong with it. */
const parseCrop = (value: string): Result.Result<Crop, string> => {
  const [, x = "", y = "", width = "", height = ""] = CROP.exec(value) ?? [];
  const crop = { x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
  return x !== "" && crop.width > 0 && crop.height > 0
    ? Result.succeed(crop)
    : Result.fail(`--crop wants x,y,w,h: whole numbers, w and h above 0 (got "${value}")`);
};

/** What to do: pass the arguments to `herdr-app`, or take a screenshot. */
export type HerdrCommand =
  | { readonly _tag: "Pass"; readonly args: ReadonlyArray<string> }
  | ({ readonly _tag: "Shot" } & ShotRequest);

/** The arguments after `shot`: `<file> [--crop x,y,w,h]`, or what's wrong with them. */
const parseShotArgs = (args: ReadonlyArray<string>): Result.Result<HerdrCommand, string> => {
  const [file, flag, value = "", ...rest] = args;
  if (file === undefined || file.startsWith("-")) return Result.fail("shot wants a <file>");
  const extra = flag === "--crop" ? rest[0] : flag;
  if (extra !== undefined) return Result.fail(`unexpected argument "${extra}"`);
  return flag === "--crop"
    ? Result.map(parseCrop(value), (crop) => ({ _tag: "Shot", file, crop: Option.some(crop) }))
    : Result.succeed({ _tag: "Shot", file, crop: Option.none() });
};

/** `vp run herdr`'s arguments as a command, or what's wrong with them. */
export const parseArgs = (args: ReadonlyArray<string>): Result.Result<HerdrCommand, string> =>
  args[0] === "shot" ? parseShotArgs(args.slice(1)) : Result.succeed({ _tag: "Pass", args });

/** Exit 2 with `problem` and the shot usage on stderr. */
const usageError = (problem: string): HerdrResult => ({
  code: 2,
  stdout: "",
  stderr: `herdr: ${problem}\n${SHOT_USAGE}\n`,
});

/**
 * Shoots the Herdr host's window into a temp folder on the host and copies the
 * image back to `file`. The temp folder is removed whether the shot worked or not.
 */
const shot = Effect.fn("shot")(function* ({ file, crop }: ShotRequest) {
  const host = yield* HerdrHost;
  const dir = yield* host.makeTempDir;
  const image = `${dir}/shot.png`;
  const taken = yield* Effect.exit(
    host.herdrApp(["shot", image]).pipe(
      Effect.andThen(
        Option.match(crop, {
          onNone: () => Effect.void,
          onSome: (rect) => host.cropImage(image, rect),
        }),
      ),
      Effect.andThen(host.copyBack(image, file)),
    ),
  );
  yield* host.removeTempDir(dir);
  return yield* taken;
});

/**
 * Runs `herdr-app <args>` on the dev target's Herdr host, or takes a screenshot for
 * `shot`. Never fails: every failure is a result.
 */
export const runHerdr = Effect.fn("runHerdr")(function* (
  args: ReadonlyArray<string>,
  options: LoadOptions = {},
): Effect.fn.Return<HerdrResult> {
  const parsed = parseArgs(args);
  if (Result.isFailure(parsed)) return usageError(parsed.failure);
  const command = parsed.success;
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
  const run =
    command._tag === "Shot"
      ? shot(command).pipe(
          Effect.as({ code: 0, stdout: `saved ${command.file}\n`, stderr: "" }),
          // herdr-app ran; a step around it (temp folder, copy back) didn't.
          Effect.catchTag("TransportError", ({ operation, cause }) =>
            Effect.succeed(failure(`couldn't ${operation} (${causeText(cause)})`)),
          ),
        )
      : Effect.gen(function* () {
          const host = yield* HerdrHost;
          const output = yield* host.herdrApp(command.args);
          return { code: 0, ...output };
        });
  return yield* run.pipe(
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
