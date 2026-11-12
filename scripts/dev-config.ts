import { Data, Effect, Predicate, Result, Schema, SchemaIssue } from "effect";

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
