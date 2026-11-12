import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { Context, Data, Effect, Layer, Predicate } from "effect";
import type { DevTarget } from "./dev-config.ts";

/** How to reach a Herdr host over SSH, and where Herdr lives on it. */
export type RemoteTarget = Omit<Extract<DevTarget, { readonly _tag: "Remote" }>, "_tag" | "file">;

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

const MOD_STATES: ReadonlyArray<string> = ["Missing", "DevBuild", "Installed"];

/** Whether `value` names a ModState. */
const isModState = (value: string): value is ModState => MOD_STATES.includes(value);

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

/** A failed command as `exit <code>`, then what it said on stderr, its lines joined by "; ". */
const commandFailedText = ({ code, stderr }: CommandFailed): string => {
  const said = stderr.trim();
  return said === "" ? `exit ${code}` : `exit ${code}: ${said.split("\n").join("; ")}`;
};

/**
 * A failure's cause as text, for messages to people: a failed command's exit code
 * and what it said, else the cause's message, else the cause itself.
 */
export const causeText = (cause: unknown): string =>
  cause instanceof CommandFailed
    ? commandFailedText(cause)
    : Predicate.hasProperty(cause, "message")
      ? String(cause.message)
      : String(cause);

/** What a command that exited 0 printed. */
export interface CommandOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/** `mods/<name>/` is an installed mod (no dev marker), so it is left alone. */
export class InstalledModInTheWay extends Data.TaggedError("InstalledModInTheWay")<{
  readonly path: string;
}> {}

/**
 * SSH couldn't connect to the Herdr host: ssh exited 255 before the remote shell
 * ran, or rsync over it exited 255.
 * `host` is `user@host:port`; `stderr` is what ssh said.
 */
export class HostUnreachable extends Data.TaggedError("HostUnreachable")<{
  readonly host: string;
  readonly stderr: string;
}> {
  override get message(): string {
    const reason = this.stderr.trim();
    return `Herdr host unreachable: ${this.host}${reason === "" ? "" : ` (${reason})`}`;
  }
}

/** `value` as one single-quoted `sh` word, so the remote shell reads it literally. */
const shQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * A path on the Herdr host as a `sh` word. A leading `~/` becomes `"$HOME"/`, so
 * the remote shell expands it while the rest stays quoted.
 */
const shPath = (path: string): string =>
  path === "~"
    ? `"$HOME"`
    : path.startsWith("~/")
      ? `"$HOME"/${shQuote(path.slice(2))}`
      : shQuote(path);

/** The exit code a remote command uses to say the path it was given isn't there. */
const MISSING = 44;

/** How a finished process ended. A null exit code (ended by a signal) is -1. */
interface ProcessResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs `command` with `args`, feeding it `input`, and waits for it to end. */
const runProcess = (
  command: string,
  args: ReadonlyArray<string>,
  input: string,
): Effect.Effect<ProcessResult, TransportError> =>
  Effect.callback<ProcessResult, TransportError>((resume) => {
    const child = spawn(command, [...args], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Array<Buffer> = [];
    const stderr: Array<Buffer> = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    // A process that exits before reading all its input breaks the pipe; its exit
    // code still says how it went, so the write error itself carries nothing.
    child.stdin.on("error", () => undefined);
    child.on("error", (cause) =>
      resume(Effect.fail(new TransportError({ operation: [command, ...args].join(" "), cause }))),
    );
    child.on("close", (code) =>
      resume(
        Effect.succeed({
          code: code ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        }),
      ),
    );
    child.stdin.end(input);
  });

/** What ssh (and rsync over it) exits with when it can't connect. */
const SSH_UNREACHABLE = 255;

/** The ssh options every call to the Herdr host carries. */
const sshOptions = (target: RemoteTarget): ReadonlyArray<string> => [
  "-p",
  String(target.port),
  "-o",
  "ConnectTimeout=5",
  "-o",
  "BatchMode=yes",
  "-l",
  target.user,
];

/** The process's result, or HostUnreachable when it is ssh failing to connect. */
const reached =
  (target: RemoteTarget) =>
  (result: ProcessResult): Effect.Effect<ProcessResult, HostUnreachable> =>
    result.code === SSH_UNREACHABLE
      ? Effect.fail(
          new HostUnreachable({
            host: `${target.user}@${target.host}:${target.port}`,
            stderr: result.stderr,
          }),
        )
      : Effect.succeed(result);

/**
 * The line the remote shell prints on stderr before anything else. ssh exits 255
 * both when it can't connect and when the remote command itself exits 255; this
 * line tells the two apart, since only a shell that ran prints it.
 */
const CONNECTED = "herdr-mods: connected";
const CONNECTED_LINE = `${CONNECTED}\n`;

/**
 * Runs `script` with `sh` on the Herdr host, feeding it `input`. Fails with
 * HostUnreachable when ssh can't connect; once the remote shell has run, every
 * exit code (255 included) is the script's, and its stderr is the script's own.
 */
const sshCommand =
  (target: RemoteTarget) =>
  (script: string, input = ""): Effect.Effect<ProcessResult, TransportError | HostUnreachable> =>
    runProcess(
      "ssh",
      [...sshOptions(target), target.host, `printf '%s\\n' ${shQuote(CONNECTED)} >&2; ${script}`],
      input,
    ).pipe(
      Effect.flatMap((result) =>
        result.stderr.includes(CONNECTED_LINE)
          ? Effect.succeed({ ...result, stderr: result.stderr.replace(CONNECTED_LINE, "") })
          : reached(target)(result),
      ),
    );

/**
 * Runs `rsync -rlt` (recursive, links as links, times kept; never `--delete`) from
 * `source` to `destination` over ssh with the same options as every other call.
 * Fails with HostUnreachable when ssh can't connect.
 */
const rsyncCommand =
  (target: RemoteTarget) =>
  (
    source: string,
    destination: string,
  ): Effect.Effect<ProcessResult, TransportError | HostUnreachable> =>
    runProcess(
      "rsync",
      ["-rlt", "-e", ["ssh", ...sshOptions(target)].join(" "), source, destination],
      "",
    ).pipe(Effect.flatMap(reached(target)));

/**
 * A path on the Herdr host as rsync's remote side reads it: a `~/` path becomes
 * relative, which rsync reads from the remote home.
 */
const rsyncPath = (path: string): string =>
  path === "~" ? "." : path.startsWith("~/") ? path.slice(2) : path;

/**
 * The output of a remote command that exited 0. Any other exit means the
 * operation couldn't be carried out: a TransportError naming it, with the
 * command's exit code and output as the cause.
 */
const succeeded = (
  operation: string,
  { code, stdout, stderr }: ProcessResult,
): Effect.Effect<string, TransportError> =>
  code === 0
    ? Effect.succeed(stdout)
    : Effect.fail(
        new TransportError({ operation, cause: new CommandFailed({ code, stdout, stderr }) }),
      );

/** A rectangle of an image in pixels: its top-left corner and its size. */
export interface Crop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `sips` arguments that crop to `crop`: height and width, then the y and x offset. */
const sipsCropArgs = (crop: Crop): ReadonlyArray<string> => [
  "-c",
  ...[crop.height, crop.width].map(String),
  "--cropOffset",
  ...[crop.y, crop.x].map(String),
];

/** Runs `command` from PATH on this machine; exiting non-zero is CommandFailed. */
const runLocal = Effect.fn("runLocal")(function* (command: string, args: ReadonlyArray<string>) {
  const result = spawnSync(command, [...args], { encoding: "utf8" });
  if (result.error !== undefined) {
    const operation = [`run ${command}`, ...args].join(" ");
    return yield* new TransportError({ operation, cause: result.error });
  }
  const { stdout, stderr } = result;
  if (result.status !== 0) {
    // A null status means a signal ended it: no exit code, so -1.
    return yield* new CommandFailed({ code: result.status ?? -1, stdout, stderr });
  }
  return { stdout, stderr };
});

export class HerdrHost extends Context.Service<
  HerdrHost,
  {
    /** Where `relPath` in the Herdr home is, for messages to people. Does no IO. */
    readonly location: (relPath: string) => string;
    readonly readFile: (
      relPath: string,
    ) => Effect.Effect<string, FileMissing | TransportError | HostUnreachable>;
    readonly writeFile: (
      relPath: string,
      content: string,
    ) => Effect.Effect<void, TransportError | HostUnreachable>;
    readonly listDir: (
      relPath: string,
    ) => Effect.Effect<ReadonlyArray<string>, FileMissing | TransportError | HostUnreachable>;
    readonly modState: (name: string) => Effect.Effect<ModState, TransportError | HostUnreachable>;
    readonly removeDevBuild: (
      name: string,
    ) => Effect.Effect<
      "Removed" | "Missing",
      InstalledModInTheWay | TransportError | HostUnreachable
    >;
    readonly herdrApp: (
      args: ReadonlyArray<string>,
    ) => Effect.Effect<CommandOutput, CommandFailed | TransportError | HostUnreachable>;
    /**
     * Copies the contents of the local folder `localDir` into `path` on the host,
     * making it. Files already there and not in `localDir` stay (no delete), so
     * files Herdr wrote into a mod's folder survive.
     */
    readonly syncInto: (
      localDir: string,
      path: string,
    ) => Effect.Effect<void, TransportError | HostUnreachable>;
    /** Copies the file at `path` on the host to `localPath` on this machine. */
    readonly copyBack: (
      path: string,
      localPath: string,
    ) => Effect.Effect<void, TransportError | HostUnreachable>;
    /** Makes a new empty folder in the host's temp folder; gives its absolute path. */
    readonly makeTempDir: Effect.Effect<string, TransportError | HostUnreachable>;
    /** Removes the folder at the absolute `path` on the host, and everything in it. */
    readonly removeTempDir: (path: string) => Effect.Effect<void, TransportError | HostUnreachable>;
    /** Crops the image at the absolute `path` on the host to `crop`, in place, with `sips`. */
    readonly cropImage: (
      path: string,
      crop: Crop,
    ) => Effect.Effect<void, CommandFailed | TransportError | HostUnreachable>;
  }
>()("herdr-mods/HerdrHost") {
  /**
   * The Herdr app on a Herdr host reached over SSH. Every call is `ssh` with the
   * user, host and port as separate arguments, a 5 second connect timeout and
   * batch mode (no prompts), so a host that's asleep fails fast instead of hanging.
   * Every remote argument is shell-quoted. A connection failure is HostUnreachable.
   */
  static readonly remote = (target: RemoteTarget) => {
    const remotePath = (path: string): string =>
      path.startsWith("/") ? path : `${target.herdrHome}/${path}`;
    const location = (path: string): string => `${target.user}@${target.host}:${remotePath(path)}`;
    const ssh = sshCommand(target);
    const rsync = rsyncCommand(target);
    const remote = (path: string): string =>
      `${target.user}@${target.host}:${rsyncPath(remotePath(path))}`;

    return Layer.succeed(
      HerdrHost,
      HerdrHost.of({
        location,
        readFile: Effect.fn("HerdrHost.readFile")(function* (relPath: string) {
          const path = shPath(remotePath(relPath));
          const result = yield* ssh(`[ -e ${path} ] || exit ${MISSING}; cat -- ${path}`);
          if (result.code === MISSING) return yield* new FileMissing({ path: location(relPath) });
          return yield* succeeded(`read ${location(relPath)}`, result);
        }),
        writeFile: Effect.fn("HerdrHost.writeFile")(function* (relPath: string, content: string) {
          const path = remotePath(relPath);
          const folder = shPath(posix.dirname(path));
          const result = yield* ssh(`mkdir -p -- ${folder} && cat > ${shPath(path)}`, content);
          yield* succeeded(`write ${location(relPath)}`, result);
        }),
        listDir: Effect.fn("HerdrHost.listDir")(function* (relPath: string) {
          const path = shPath(remotePath(relPath));
          const result = yield* ssh(`[ -d ${path} ] || exit ${MISSING}; ls -A1 -- ${path}`);
          if (result.code === MISSING) return yield* new FileMissing({ path: location(relPath) });
          const listing = yield* succeeded(`list ${location(relPath)}`, result);
          return listing
            .split("\n")
            .filter((entry) => entry !== "")
            .sort();
        }),
        modState: Effect.fn("HerdrHost.modState")(function* (name: string) {
          const dir = shPath(remotePath(`mods/${name}`));
          const result = yield* ssh(
            `if [ ! -e ${dir} ]; then echo Missing; ` +
              `elif [ -e ${dir}/${DEV_MARKER} ]; then echo DevBuild; else echo Installed; fi`,
          );
          const operation = `check ${location(`mods/${name}`)}`;
          const answer = (yield* succeeded(operation, result)).trim();
          return isModState(answer)
            ? answer
            : yield* new TransportError({ operation, cause: `unexpected answer: ${answer}` });
        }),
        removeDevBuild: Effect.fn("HerdrHost.removeDevBuild")(function* (name: string) {
          const dir = shPath(remotePath(`mods/${name}`));
          // Checked and removed in one remote command, so nothing can change between.
          const result = yield* ssh(
            `[ -e ${dir} ] || { echo Missing; exit 0; }; ` +
              `[ -e ${dir}/${DEV_MARKER} ] || { echo Installed; exit 0; }; ` +
              `rm -rf -- ${dir} && echo Removed`,
          );
          const answer = (yield* succeeded(`remove ${location(`mods/${name}`)}`, result)).trim();
          if (answer === "Installed") {
            return yield* new InstalledModInTheWay({ path: location(`mods/${name}`) });
          }
          return answer === "Missing" ? ("Missing" as const) : ("Removed" as const);
        }),
        // herdr-app isn't on PATH in a non-login SSH shell, so it runs by its full path.
        herdrApp: Effect.fn("HerdrHost.herdrApp")(function* (args: ReadonlyArray<string>) {
          const { code, stdout, stderr } = yield* ssh(
            [shPath(target.herdrApp), ...args.map(shQuote)].join(" "),
          );
          if (code !== 0) return yield* new CommandFailed({ code, stdout, stderr });
          return { stdout, stderr };
        }),
        syncInto: Effect.fn("HerdrHost.syncInto")(function* (localDir: string, path: string) {
          const result = yield* rsync(`${localDir}/`, `${remote(path)}/`);
          yield* succeeded(`sync ${localDir} to ${location(path)}`, result);
        }),
        copyBack: Effect.fn("HerdrHost.copyBack")(function* (path: string, localPath: string) {
          const result = yield* rsync(remote(path), localPath);
          yield* succeeded(`copy ${location(path)} to ${localPath}`, result);
        }),
        makeTempDir: Effect.gen(function* () {
          const result = yield* ssh(`mktemp -d "\${TMPDIR:-/tmp}/herdr-mods.XXXXXX"`);
          return (yield* succeeded(`make a temp folder on ${location("")}`, result)).trim();
        }),
        removeTempDir: Effect.fn("HerdrHost.removeTempDir")(function* (path: string) {
          const result = yield* ssh(`rm -rf -- ${shQuote(path)}`);
          yield* succeeded(`remove ${target.user}@${target.host}:${path}`, result);
        }),
        // sips is in /usr/bin on macOS, so it is on PATH even in a non-login SSH shell.
        cropImage: Effect.fn("HerdrHost.cropImage")(function* (path: string, crop: Crop) {
          const { code, stdout, stderr } = yield* ssh(
            ["sips", ...sipsCropArgs(crop), path].map(shQuote).join(" "),
          );
          if (code !== 0) return yield* new CommandFailed({ code, stdout, stderr });
        }),
      }),
    );
  };

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
        herdrApp: (args) => runLocal("herdr-app", args),
        syncInto: (localDir, path) => {
          const target = resolve(home, path);
          return Effect.try({
            try: () => cpSync(localDir, target, { recursive: true }),
            catch: (cause) =>
              new TransportError({ operation: `sync ${localDir} to ${target}`, cause }),
          });
        },
        copyBack: (path, localPath) => {
          const source = resolve(home, path);
          return Effect.try({
            try: () => cpSync(source, localPath),
            catch: (cause) =>
              new TransportError({ operation: `copy ${source} to ${localPath}`, cause }),
          });
        },
        makeTempDir: Effect.try({
          try: () => mkdtempSync(join(tmpdir(), "herdr-mods.")),
          catch: (cause) => new TransportError({ operation: "make a temp folder", cause }),
        }),
        removeTempDir: (path) =>
          Effect.try({
            try: () => rmSync(path, { recursive: true, force: true }),
            catch: (cause) => new TransportError({ operation: `remove ${path}`, cause }),
          }),
        cropImage: (path, crop) =>
          runLocal("sips", [...sipsCropArgs(crop), path]).pipe(Effect.asVoid),
      }),
    );
  };
}

/** The HerdrHost layer for a dev target. */
export const hostLayer = (target: DevTarget): Layer.Layer<HerdrHost> =>
  target._tag === "Local" ? HerdrHost.local(target.herdrHome) : HerdrHost.remote(target);
