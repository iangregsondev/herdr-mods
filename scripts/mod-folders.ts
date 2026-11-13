// Reads the repo's mod folders: the folders under apps/ or mods/, and the package.json
// in a mod's source folder. Shared by the build (mod-pack.ts) and the root scripts.
import { readdirSync, readFileSync } from "node:fs";
import { Data, Effect, Schema } from "effect";

/** The two fields of a mod's package.json that name it and its release. */
export const ModPackage = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
});
export type ModPackage = typeof ModPackage.Type;

/** A mod's package.json couldn't be read, or had no name and version. */
export class PackageUnreadable extends Data.TaggedError("PackageUnreadable")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

const decodeModPackage = Schema.decodeUnknownEffect(Schema.fromJsonString(ModPackage));

/** The name and version in the package.json at `path`. */
export const readModPackage = (path: string): Effect.Effect<ModPackage, PackageUnreadable> =>
  Effect.try({
    try: () => readFileSync(path, "utf8"),
    catch: (cause) => new PackageUnreadable({ path, cause }),
  }).pipe(
    Effect.flatMap((text) =>
      decodeModPackage(text).pipe(
        Effect.mapError((cause) => new PackageUnreadable({ path, cause })),
      ),
    ),
  );

/**
 * The names of the folders in `dir`, sorted. `onFail` makes the error when `dir` can't
 * be listed, so each caller keeps its own.
 */
export const subfolders = <E>(
  dir: string,
  onFail: (cause: unknown) => E,
): Effect.Effect<ReadonlyArray<string>, E> =>
  Effect.try({
    try: () =>
      readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    catch: onFail,
  });
