// Runs `herdr-app check` on every built mod in the repo's mods/, on the dev target's
// Herdr host. Local: on each mods/<name>/ in place. Remote: on a copy of mods/ in a
// temp folder on the host, removed whatever the result. Every mod is checked, and
// the run exits 1 naming each one that failed.
//
//   vp run check:mods
import { Effect, Result } from "effect";
import { devConfigProblem, type LoadOptions, loadDevTarget } from "./dev-config.ts";
import { causeText, HerdrHost, hostLayer, TransportError } from "./herdr-host.ts";
import { subfolders } from "./mod-folders.ts";
import { runMain, type ScriptResult, scriptFailure } from "./script-result.ts";

/** How one mod's `herdr-app check` went, and what it printed. */
interface ModCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

/** Exit 1 with `message` on stderr. */
const failure = (message: string): ScriptResult => scriptFailure("check:mods:", [message]);

/** The mod folders in `modsDir`, sorted by name. */
const modNames = (modsDir: string): Effect.Effect<ReadonlyArray<string>, TransportError> =>
  subfolders(modsDir, (cause) => new TransportError({ operation: `list ${modsDir}`, cause }));

/** One result from every mod's check: exit 1 naming the mods that failed, if any. */
const summary = (checks: ReadonlyArray<ModCheck>): ScriptResult => {
  const failed = checks.filter((check) => !check.passed).map((check) => check.name);
  const stdout = checks.map((check) => check.stdout).join("");
  const stderr = checks.map((check) => check.stderr).join("");
  return failed.length === 0
    ? { code: 0, stdout, stderr }
    : { code: 1, stdout, stderr: `${stderr}check:mods: failed: ${failed.join(", ")}\n` };
};

/** Checks every mod in `modsDir` on the dev target's Herdr host. Never fails: every failure is a result. */
export const runCheckMods = Effect.fn("runCheckMods")(function* (
  modsDir: string,
  options: LoadOptions = {},
): Effect.fn.Return<ScriptResult> {
  const loaded = yield* Effect.result(loadDevTarget(options));
  if (Result.isFailure(loaded)) {
    return failure(devConfigProblem(loaded.failure));
  }
  const target = loaded.success;
  return yield* Effect.gen(function* () {
    const host = yield* HerdrHost;
    const names = yield* modNames(modsDir);
    if (names.length === 0) return failure(`no mods in ${modsDir}`);
    // Every mod is checked, so one run names every mod that fails.
    const checkEach = (dir: string) =>
      Effect.forEach(names, (name) =>
        host.herdrApp(["check", `${dir}/${name}/`]).pipe(
          Effect.map(({ stdout, stderr }): ModCheck => ({ name, passed: true, stdout, stderr })),
          Effect.catchTag("CommandFailed", ({ stdout, stderr }) =>
            Effect.succeed<ModCheck>({ name, passed: false, stdout, stderr }),
          ),
        ),
      );
    // A remote host can't see this machine's files, so it checks a copy in a temp
    // folder there (never the host's own mods/), removed however the checks end.
    const checks = yield* target._tag === "Local"
      ? checkEach(modsDir)
      : Effect.acquireUseRelease(
          host.makeTempDir,
          (dir) => host.syncInto(modsDir, dir).pipe(Effect.andThen(checkEach(dir))),
          (dir) => host.removeTempDir(dir),
        );
    return summary(checks);
  }).pipe(
    Effect.provide(hostLayer(target)),
    Effect.catchTags({
      HostUnreachable: (error) => Effect.succeed(failure(error.message)),
      TransportError: ({ operation, cause }) =>
        Effect.succeed(failure(`couldn't ${operation} (${causeText(cause)})`)),
    }),
  );
});

if (import.meta.main) await runMain(runCheckMods(process.argv[2] ?? "mods"));
