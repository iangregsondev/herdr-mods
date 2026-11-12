// The dev target: where dev builds go. `local` is the Herdr app on this machine;
// `remote` is a Herdr host reached over SSH. Set in herdr-dev.json at the repo root
// (git-ignored; see herdr-dev.example.json), or the file HERDR_DEV_CONFIG names.
// It holds no password or key: SSH auth stays with the developer's own key.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Data, Effect, Option, Predicate, Result, Schema, SchemaIssue } from "effect";

export type DevTarget = Data.TaggedEnum<{
  Local: { readonly herdrHome: string; readonly file: string; readonly found: boolean };
  Remote: {
    readonly host: string;
    readonly user: string;
    readonly port: number;
    readonly herdrHome: string;
    readonly herdrApp: string;
    readonly file: string;
  };
}>;

export const DevTarget = Data.taggedEnum<DevTarget>();

export class DevConfigInvalid extends Data.TaggedError("DevConfigInvalid")<{
  readonly file: string;
  readonly field: string;
  readonly message: string;
}> {}

/** A key that may be left out, decoding to `value` when it is. */
const withDefault = <S extends Schema.Top>(schema: S, value: S["Encoded"]) =>
  Schema.withDecodingDefaultKey<S>(Effect.succeed(value))(schema);

const RemoteFields = Schema.Struct({
  host: Schema.NonEmptyString,
  user: Schema.NonEmptyString,
  port: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })), 22),
  herdrHome: withDefault(Schema.NonEmptyString, "~/.config/herdr-app"),
  herdrApp: withDefault(Schema.NonEmptyString, "~/.local/bin/herdr-app"),
});

const DevConfigFile = Schema.Struct({
  target: withDefault(Schema.Literals(["local", "remote"]), "local"),
  remote: Schema.optionalKey(RemoteFields),
});

// Excess fields are errors, so a misspelt key never passes as a default.
const decodeFile = Schema.decodeUnknownResult(Schema.fromJsonString(DevConfigFile), {
  onExcessProperty: "error",
});

const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * The first failing field as a dotted path (`remote.port`), and its message.
 * A file that isn't a JSON object has no field to name, so it names the whole file.
 */
function firstProblem(issue: SchemaIssue.Issue): {
  readonly field: string;
  readonly message: string;
} {
  const first = formatIssue(issue).issues[0];
  const field = (first?.path ?? [])
    .map((segment) => String(Predicate.isObject(segment) ? segment.key : segment))
    .join(".");
  return { field: field === "" ? "(whole file)" : field, message: first?.message ?? "invalid" };
}

/**
 * Decodes the text of a dev config file into a dev target. `file` names the
 * file in errors and the target line; `localHome` is the Herdr home for `local`.
 */
export function decodeDevConfig(
  text: string,
  options: { readonly file: string; readonly localHome: string },
): Result.Result<DevTarget, DevConfigInvalid> {
  const invalid = (problem: { readonly field: string; readonly message: string }) =>
    new DevConfigInvalid({ file: options.file, ...problem });
  return decodeFile(text).pipe(
    Result.mapError((error) => invalid(firstProblem(error.issue))),
    Result.flatMap((config): Result.Result<DevTarget, DevConfigInvalid> => {
      if (config.target === "local") {
        return Result.succeed(
          DevTarget.Local({ herdrHome: options.localHome, file: options.file, found: true }),
        );
      }
      return config.remote === undefined
        ? Result.fail(invalid({ field: "remote", message: "Missing key" }))
        : Result.succeed(DevTarget.Remote({ ...config.remote, file: options.file }));
    }),
  );
}

/** Where to look: the environment (`HERDR_DEV_CONFIG`, `HERDR_APP_HOME`) and the repo root. */
export interface LoadOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly repoRoot?: string;
}

/** The file exists but couldn't be read (permissions, a folder in its place). */
export class DevConfigUnreadable extends Data.TaggedError("DevConfigUnreadable")<{
  readonly file: string;
  readonly cause: unknown;
}> {}

const CONFIG_NAME = "herdr-dev.json";
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const readText = (path: string, file: string) =>
  Effect.try({
    try: () => readFileSync(path, "utf8"),
    catch: (cause) => new DevConfigUnreadable({ file, cause }),
  });

/** The file's text, or none when there is no file at `path`. */
const readIfPresent = (path: string, file: string) =>
  readText(path, file).pipe(
    Effect.asSome,
    Effect.catchIf(
      (error) => Predicate.hasProperty(error.cause, "code") && error.cause.code === "ENOENT",
      () => Effect.succeed(Option.none<string>()),
    ),
  );

/**
 * Loads the dev target from `herdr-dev.json` at the repo root, or from the file
 * `HERDR_DEV_CONFIG` names. No `herdr-dev.json` at the repo root means `local`,
 * with the Herdr home from `HERDR_APP_HOME` or the default. A `HERDR_DEV_CONFIG`
 * path is explicit, so a missing file there fails like any file that can't be
 * read or decoded: it never falls back to `local`.
 */
export const loadDevTarget = Effect.fn("loadDevTarget")(function* (options: LoadOptions = {}) {
  const env = options.env ?? process.env;
  const override = env.HERDR_DEV_CONFIG;
  const file = override ?? CONFIG_NAME;
  const path =
    override === undefined ? join(options.repoRoot ?? REPO_ROOT, CONFIG_NAME) : resolve(override);
  const localHome = env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app");
  const text = yield* override === undefined
    ? readIfPresent(path, file)
    : Effect.asSome(readText(path, file));
  return yield* Option.match(text, {
    onNone: () => Effect.succeed(DevTarget.Local({ herdrHome: localHome, file, found: false })),
    onSome: (text) => Effect.fromResult(decodeDevConfig(text, { file, localHome })),
  });
});

/** One line naming the dev target, for the watch to print when it starts. */
export const describeDevTarget: (target: DevTarget) => string = DevTarget.$match({
  Local: ({ found, file }) => `target: local (${found ? "" : "no "}${file})`,
  Remote: ({ user, host, port, file }) => `target: remote ${user}@${host}:${port} (${file})`,
});
