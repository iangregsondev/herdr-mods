// The copies of Herdr's mods this mod plays: Herdr's installed `main.js`, patched, written
// into this mod's own folder and imported from there (docs/adr/0003). Pure: `herdr` is
// imported as a type only, and main.ts hands the real API to the layers.
import { Context, Data, Effect, Layer, Option, Predicate, Result } from "effect";
import { at, fields, Files, type FileError, type WriteConflict } from "worktrunk-mailbox";
import type { Miss } from "./patch.ts";
import { patchedSource, wrapFor, type Role } from "./wraps.ts";

/** Importing a copy from this mod's folder failed. */
export class ImportFailed extends Data.TaggedError("ImportFailed")<{
  readonly file: string;
  readonly cause: unknown;
}> {}

/** Herdr's mod `mod`, which a copy is made from, isn't installed. */
export class HerdrModMissing extends Data.TaggedError("HerdrModMissing")<{
  readonly mod: string;
}> {}

/** The copy of Herdr's mod `mod` has no view class as its default export. */
export class NotAView extends Data.TaggedError("NotAView")<{ readonly mod: string }> {}

/** The copy at `path` in this mod's folder couldn't be written (or read, to compare). */
export class CopyNotWritten extends Data.TaggedError("CopyNotWritten")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Every way making a copy can fail. */
type CopyError =
  | HerdrModMissing
  | FileError
  | CopyNotWritten
  | WriteConflict
  | ImportFailed
  | NotAView;

/** Loads a module from this mod's own folder, by its file name there. */
export class Modules extends Context.Service<
  Modules,
  { readonly load: (file: string) => Effect.Effect<unknown, ImportFailed> }
>()("menus/Modules") {
  static readonly layer = (load: (file: string) => Promise<unknown>) =>
    Layer.succeed(
      Modules,
      Modules.of({
        // No `signal` parameter: Herdr's runtime has no AbortController.
        load: (file) =>
          Effect.tryPromise({
            try: () => load(file),
            catch: (cause) => new ImportFailed({ file, cause }),
          }),
      }),
    );
}

/** A copy of Herdr's mod, loaded. */
export interface Copy {
  /** The copy's exports: Herdr's view class as `default`, and the menu copy's hooks. */
  readonly exports: Readonly<Record<string, unknown>>;
  /** The patch points that missed; the copy is then Herdr's file unchanged. */
  readonly misses: readonly Miss[];
}

/**
 * The copy for `role`, made in this mod's folder (`self`) in the Herdr app at `home`,
 * or the one-line reason it couldn't be.
 */
export const loadCopy = (
  role: Role,
  home: string,
  self: string,
): Effect.Effect<Result.Result<Copy, string>, never, Files | Modules> =>
  copyOf(role, home, self).pipe(Effect.result, Effect.map(Result.mapError(reasonOf)));

/** A rejection's message, or the rejected value as text. */
const causeText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Why a copy couldn't be made, in one line for the person. */
const reasonOf = (error: CopyError): string => {
  switch (error._tag) {
    case "HerdrModMissing":
      return `Herdr's ${error.mod} mod isn't installed`;
    case "ImportFailed":
      return `couldn't load ${error.file}: ${causeText(error.cause)}`;
    case "NotAView":
      return `Herdr's ${error.mod} has no default export to show`;
    case "CopyNotWritten":
      return `couldn't write ${error.path}: ${causeText(error.cause)}`;
    case "FileError":
      return `couldn't read ${error.path}: ${causeText(error.cause)}`;
    case "WriteConflict":
      return `${error.path} changed while it was written; try again`;
  }
};

/** The copy file's name in this mod's folder: hidden, so writing it reloads nothing. */
const copyFile = (mod: string): string => `.herdr-${mod}.js`;

/** Writes `text` at `path` unless the file there holds it already. */
const writeIfChanged = Effect.fn("writeIfChanged")(function* (path: string, text: string) {
  const files = yield* Files;
  const current = yield* files.read(path).pipe(
    Effect.asSome,
    Effect.catchTag("FileMissing", () => Effect.succeed(Option.none<string>())),
  );
  if (Option.contains(current, text)) return;
  yield* Option.match(current, {
    onNone: () => files.create(path, text),
    onSome: (old) => files.replace(path, text, old),
  });
});

const copyOf = Effect.fn("copyOf")(function* (role: Role, home: string, self: string) {
  const files = yield* Files;
  const modules = yield* Modules;
  const wrap = wrapFor(role, self);
  const source = yield* files
    .read(`${home}/mods/${wrap.mod}/main.js`)
    .pipe(
      Effect.catchTag("FileMissing", () => Effect.fail(new HerdrModMissing({ mod: wrap.mod }))),
    );
  const patch = patchedSource(wrap, source);
  const text = Result.getOrElse(patch, () => source);
  const file = copyFile(wrap.mod);
  yield* writeIfChanged(`${home}/mods/${self}/${file}`, text).pipe(
    Effect.catchTag("FileError", (failed) =>
      Effect.fail(new CopyNotWritten({ path: failed.path, cause: failed.cause })),
    ),
  );
  const loaded = yield* modules.load(file);
  // Herdr's mods default-export a class extending View, as every mod must.
  if (!Predicate.isFunction(at(loaded, "default"))) {
    return yield* new NotAView({ mod: wrap.mod });
  }
  const misses = Result.match(patch, { onSuccess: () => [], onFailure: (missed) => missed });
  const copy: Copy = { exports: fields(loaded), misses };
  return copy;
});
