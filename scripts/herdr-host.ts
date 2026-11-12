import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Context, Data, Effect, Layer, Predicate } from "effect";

/**
 * Marks a folder in the Herdr app as a dev build from this repo. Hidden, so
 * Herdr ignores it. A folder without it is a real install and is never touched.
 */
export const DEV_MARKER = ".herdr-mods-dev";

/**
 * What `mods/<name>/` in the Herdr home holds: nothing, a dev build from this
 * repo (it has the marker), or an installed mod (no marker).
 */
export type ModState = "Missing" | "DevBuild" | "Installed";

/** The file or folder isn't there. `path` is where it was looked for. */
export class FileMissing extends Data.TaggedError("FileMissing")<{ readonly path: string }> {}

/** The operation couldn't be carried out at all (a file system error, a process that couldn't start). */
export class TransportError extends Data.TaggedError("TransportError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

/** Whether a Node error says the path isn't there. */
const isMissing = (cause: unknown): boolean =>
  Predicate.hasProperty(cause, "code") && cause.code === "ENOENT";

/**
 * Runs a Node file system call on `path`: a missing path fails with FileMissing,
 * any other failure with TransportError.
 */
const fsCall = <A>(
  operation: string,
  path: string,
  run: () => A,
): Effect.Effect<A, FileMissing | TransportError> =>
  Effect.try({
    try: run,
    catch: (cause) =>
      isMissing(cause) ? new FileMissing({ path }) : new TransportError({ operation, cause }),
  });

/** The command ran and exited non-zero. */
export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}> {}

/** What a command that exited 0 printed. */
export interface CommandOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/** `mods/<name>/` is an installed mod (no dev marker), so it is left alone. */
export class InstalledModInTheWay extends Data.TaggedError("InstalledModInTheWay")<{
  readonly path: string;
}> {}

export class HerdrHost extends Context.Service<
  HerdrHost,
  {
    /** Where `relPath` in the Herdr home is, for messages to people. Does no IO. */
    readonly location: (relPath: string) => string;
    readonly readFile: (relPath: string) => Effect.Effect<string, FileMissing | TransportError>;
    readonly writeFile: (relPath: string, content: string) => Effect.Effect<void, TransportError>;
    readonly listDir: (
      relPath: string,
    ) => Effect.Effect<ReadonlyArray<string>, FileMissing | TransportError>;
    readonly modState: (name: string) => Effect.Effect<ModState, TransportError>;
    readonly removeDevBuild: (
      name: string,
    ) => Effect.Effect<"Removed" | "Missing", InstalledModInTheWay | TransportError>;
    readonly herdrApp: (
      args: ReadonlyArray<string>,
    ) => Effect.Effect<CommandOutput, CommandFailed | TransportError>;
  }
>()("herdr-mods/HerdrHost") {
  /** The Herdr app on this machine, with its home at `home`. */
  static readonly local = (home: string) => {
    const modState = (name: string): Effect.Effect<ModState, TransportError> =>
      Effect.sync((): ModState => {
        const dir = join(home, "mods", name);
        if (!existsSync(dir)) return "Missing";
        return existsSync(join(dir, DEV_MARKER)) ? "DevBuild" : "Installed";
      });

    const removeDevBuild = Effect.fn("HerdrHost.removeDevBuild")(function* (name: string) {
      const dir = join(home, "mods", name);
      const state = yield* modState(name);
      if (state === "Missing") return "Missing" as const;
      if (state === "Installed") return yield* new InstalledModInTheWay({ path: dir });
      return yield* Effect.try({
        try: () => {
          rmSync(dir, { recursive: true });
          return "Removed" as const;
        },
        catch: (cause) => new TransportError({ operation: `remove ${dir}`, cause }),
      });
    });

    return Layer.succeed(
      HerdrHost,
      HerdrHost.of({
        location: (relPath) => join(home, relPath),
        readFile: (relPath) => {
          const path = join(home, relPath);
          return fsCall(`read ${path}`, path, () => readFileSync(path, "utf8"));
        },
        writeFile: (relPath, content) => {
          const path = join(home, relPath);
          return Effect.try({
            try: () => {
              mkdirSync(dirname(path), { recursive: true });
              writeFileSync(path, content);
            },
            catch: (cause) => new TransportError({ operation: `write ${path}`, cause }),
          });
        },
        listDir: (relPath) => {
          const path = join(home, relPath);
          return fsCall(`list ${path}`, path, () => readdirSync(path).sort());
        },
        modState,
        removeDevBuild,
        herdrApp: Effect.fn("HerdrHost.herdrApp")(function* (args: ReadonlyArray<string>) {
          const result = spawnSync("herdr-app", [...args], { encoding: "utf8" });
          if (result.error !== undefined) {
            const operation = ["run herdr-app", ...args].join(" ");
            return yield* new TransportError({ operation, cause: result.error });
          }
          const { stdout, stderr } = result;
          if (result.status !== 0) {
            // A null status means a signal ended it: no exit code, so -1.
            return yield* new CommandFailed({ code: result.status ?? -1, stdout, stderr });
          }
          return { stdout, stderr };
        }),
      }),
    );
  };
}
