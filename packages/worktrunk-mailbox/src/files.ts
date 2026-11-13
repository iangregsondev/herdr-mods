// Reading and writing files through Herdr, as Effects with tagged errors. Pure: `herdr`
// is imported as a type only, and each mod's main.ts hands the real API to the layer.
import { Context, Data, Effect, Layer, Option, Predicate } from "effect";
import type * as herdr from "herdr";

/** The parts of Herdr's API this service calls. */
export type FilesApi = Pick<typeof herdr, "readTextFile" | "writeTextFile" | "pickFolder" | "exec">;

/** There is no file at `path`. */
export class FileMissing extends Data.TaggedError("FileMissing")<{ readonly path: string }> {}

/** Reading or writing `path` failed. */
export class FileError extends Data.TaggedError("FileError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** The write was refused because the file changed, or appeared, since it was read. */
export class WriteConflict extends Data.TaggedError("WriteConflict")<{
  readonly path: string;
}> {}

/** The system's folder picker couldn't be shown. */
export class PickerFailed extends Data.TaggedError("PickerFailed")<{ readonly cause: unknown }> {}

export class Files extends Context.Service<
  Files,
  {
    /**
     * The file's text, read on machine `on` (Herdr's name for it); this machine when left
     * out or null. Only reading reaches another machine: Herdr writes on this one only.
     */
    readonly read: (
      path: string,
      on?: string | null,
    ) => Effect.Effect<string, FileMissing | FileError>;
    /** Writes `text` as a new file at `path`; it never replaces a file. */
    readonly create: (path: string, text: string) => Effect.Effect<void, WriteConflict | FileError>;
    /** Writes `text` over the file at `path`, only while it still holds `expected`. */
    readonly replace: (
      path: string,
      text: string,
      expected: string,
    ) => Effect.Effect<void, WriteConflict | FileError>;
    /** Deletes the file at `path`. */
    readonly remove: (path: string) => Effect.Effect<void, FileError>;
    /** The folder picked in the system's folder picker, titled `prompt`; none if cancelled. */
    readonly pickFolder: (prompt: string) => Effect.Effect<Option.Option<string>, PickerFailed>;
  }
>()("worktrunk-mailbox/Files") {
  static readonly layer = (api: FilesApi) => {
    // No `signal` parameter: Herdr's runtime has no AbortController.
    const read = (path: string, on: string | null = null) =>
      Effect.tryPromise({
        try: () => (on === null ? api.readTextFile(path) : api.readTextFile(path, { on })),
        catch: (cause) => new FileError({ path, cause }),
      }).pipe(Effect.filterOrFail(Predicate.isNotNull, () => new FileMissing({ path })));
    // `expected: null` makes Herdr create the file, refusing when one is there. Herdr's
    // rejection doesn't say which, so a file found there afterwards means a conflict.
    const create = (path: string, text: string) =>
      Effect.tryPromise({
        try: () => api.writeTextFile(path, text, null),
        catch: (cause) => new FileError({ path, cause }),
      }).pipe(
        Effect.asVoid,
        Effect.catchTag("FileError", (failed) =>
          read(path).pipe(
            Effect.matchEffect({
              onSuccess: () => Effect.fail(new WriteConflict({ path })),
              onFailure: () => Effect.fail(failed),
            }),
          ),
        ),
      );
    // Herdr's rejection doesn't say why either: a file that no longer holds `expected`
    // means it changed since it was read.
    const replace = (path: string, text: string, expected: string) =>
      Effect.tryPromise({
        try: () => api.writeTextFile(path, text, expected),
        catch: (cause) => new FileError({ path, cause }),
      }).pipe(
        Effect.asVoid,
        Effect.catchTag("FileError", (failed) =>
          Effect.option(read(path)).pipe(
            Effect.flatMap((now): Effect.Effect<never, FileError | WriteConflict> =>
              Option.contains(now, expected)
                ? Effect.fail(failed)
                : Effect.fail(new WriteConflict({ path })),
            ),
          ),
        ),
      );
    const pickFolder = (prompt: string) =>
      Effect.tryPromise({
        try: () => api.pickFolder({ prompt }),
        catch: (cause) => new PickerFailed({ cause }),
      }).pipe(Effect.map(Option.fromNullishOr));
    // Herdr has no call that deletes a file, so `rm` does it; `-f` makes a file already
    // gone a success, and `--` keeps a path that starts with `-` a path.
    const remove = (path: string) =>
      Effect.tryPromise({
        try: () => api.exec("rm", ["-f", "--", path]),
        catch: (cause) => new FileError({ path, cause }),
      }).pipe(
        // `exec` resolves when rm ran, whatever it did: a non-zero exit is its failure.
        Effect.filterOrFail(
          (run) => run.code === 0,
          (run) => new FileError({ path, cause: run.stderr.trim() }),
        ),
        Effect.asVoid,
      );
    return Layer.succeed(Files, Files.of({ read, create, replace, remove, pickFolder }));
  };
}
