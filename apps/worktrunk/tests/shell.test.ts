import { assert, describe, expect, it, test } from "@effect/vitest";
import { Effect, Result } from "effect";
import { LIST_SCRIPT, OWNERS_SCRIPT, SCAN_SCRIPT, scanArgs, shArgs } from "../src/commands.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import {
  CommandFailed,
  failureText,
  ListUnreadable,
  reposOf,
  runScript,
  scanRepos,
  Shell,
  ShellError,
  wtList,
  type ExecApi,
} from "../src/shell.ts";
import { parseList } from "../src/worktrees.ts";
import states from "./fixtures/states.json?raw";

/**
 * A result with its error's tag and fields as a plain list, so a deep comparison checks
 * them all (chai compares Error objects by name and message only).
 */
const failureOf = <A, E>(result: Result.Result<A, E>) =>
  Result.mapError(result, (error): readonly unknown[] => {
    if (error instanceof CommandFailed) {
      return [error._tag, error.command, error.code, error.stderr];
    }
    if (error instanceof ListUnreadable) return [error._tag, error.message];
    if (error instanceof ShellError) return [error._tag, error.cause];
    return [String(error)];
  });

/** A Herdr API whose `exec` answers every call with `run`. */
const answering = (run: Awaited<ReturnType<ExecApi["exec"]>>): ExecApi => ({
  exec: () => Promise.resolve(run),
});

describe("Shell.use", () => {
  it.effect("a promise that resolves is its value", () =>
    Effect.gen(function* () {
      const shell = yield* Shell;
      const run = yield* shell.use((api) => api.exec("true"));
      assert.deepStrictEqual(run, { code: 0, stdout: "hi", stderr: "" });
    }).pipe(Effect.provide(Shell.layer(answering({ code: 0, stdout: "hi", stderr: "" })))),
  );

  it.effect("a promise that rejects is ShellError, with the cause", () =>
    Effect.gen(function* () {
      const shell = yield* Shell;
      const error = yield* Effect.flip(shell.use((api) => api.exec("nope")));
      assert.deepStrictEqual([error._tag, error.cause], ["ShellError", "no such program"]);
    }).pipe(Effect.provide(Shell.layer({ exec: () => Promise.reject("no such program") }))),
  );
});

describe("Shell.exec", () => {
  it.effect("a run that exits 0 is its result, run as asked", () =>
    Effect.gen(function* () {
      const calls: unknown[] = [];
      const api: ExecApi = {
        exec: (command, args, options) => {
          calls.push([command, args, options]);
          return Promise.resolve({ code: 0, stdout: "out", stderr: "" });
        },
      };
      const run = yield* Effect.gen(function* () {
        const shell = yield* Shell;
        return yield* shell.exec("git", ["status"], { cwd: "/r", timeout: 5 });
      }).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(run, { code: 0, stdout: "out", stderr: "" });
      assert.deepStrictEqual(calls, [["git", ["status"], { cwd: "/r", timeout: 5 }]]);
    }),
  );

  it.effect("a run that exits non-zero is CommandFailed, with its code and errors", () =>
    Effect.gen(function* () {
      const shell = yield* Shell;
      const result = yield* Effect.result(shell.exec("git", ["status"]));
      assert.deepStrictEqual(failureOf(result), Result.fail(["CommandFailed", "git", 128, "no"]));
    }).pipe(Effect.provide(Shell.layer(answering({ code: 128, stdout: "", stderr: "no" })))),
  );
});

/** A Herdr API that records each call and answers it with `run`. */
const recording = (run: Awaited<ReturnType<ExecApi["exec"]>>) => {
  const calls: unknown[] = [];
  const api: ExecApi = {
    exec: (command, args, options) => {
      calls.push([command, args, options]);
      return Promise.resolve(run);
    },
  };
  return { api, calls };
};

describe("runScript", () => {
  it.effect("runs the script under sh with its arguments, for up to a minute", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "ok", stderr: "" });
      const run = yield* runScript("greet", 'echo "$1"', ["you"]).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.strictEqual(run.stdout, "ok");
      assert.deepStrictEqual(calls, [["sh", shArgs('echo "$1"', ["you"]), { timeout: 60_000 }]]);
    }),
  );

  it.effect("a script that fails is CommandFailed under its label", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(runScript("wt list", "exit 3", []));
      assert.deepStrictEqual(
        failureOf(result),
        Result.fail(["CommandFailed", "wt list", 3, "boom"]),
      );
    }).pipe(Effect.provide(Shell.layer(answering({ code: 3, stdout: "", stderr: "boom" })))),
  );
});

describe("wtList", () => {
  it.effect("the worktrees wt list prints in the repo", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: states, stderr: "" });
      const worktrees = yield* wtList("/work/repo").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(worktrees, Result.getOrThrow(parseList(states)));
      assert.deepStrictEqual(calls, [
        ["sh", shArgs(LIST_SCRIPT, ["/work/repo"]), { timeout: 60_000 }],
      ]);
    }),
  );

  it.effect("output that isn't wt's JSON is ListUnreadable, with the reason", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(wtList("/r"));
      assert.deepStrictEqual(
        failureOf(result),
        Result.fail(["ListUnreadable", "wt list printed no list of worktrees"]),
      );
    }).pipe(Effect.provide(Shell.layer(answering({ code: 0, stdout: "{}", stderr: "" })))),
  );
});

describe("scanRepos", () => {
  const settings = { ...DEFAULT_SETTINGS, folders: [{ name: "Work", path: "~/work" }] };

  it.effect("runs the folder scan for the settings and reads the repos it found", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({
        code: 0,
        stdout: "/h/work\t/h/work/api\t2\n",
        stderr: "",
      });
      const repos = yield* scanRepos(settings, "/h").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(repos, [{ root: "/h/work/api", count: 2 }]);
      assert.deepStrictEqual(calls, [
        ["sh", shArgs(SCAN_SCRIPT, scanArgs(settings, "/h")), { timeout: 60_000 }],
      ]);
    }),
  );

  it.effect("with no group folders there is nothing to scan, and nothing is run", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/x\t/x/y\t1\n", stderr: "" });
      const repos = yield* scanRepos(DEFAULT_SETTINGS, "/h").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual([repos, calls], [[], []]);
    }),
  );
});

describe("reposOf", () => {
  it.effect("the repos the folders are in, from the owners script", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/r/api\t3\n", stderr: "" });
      const repos = yield* reposOf(["/r/api/src", "/r/api.feat"]).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(repos, [{ root: "/r/api", count: 3 }]);
      assert.deepStrictEqual(calls, [
        ["sh", shArgs(OWNERS_SCRIPT, ["/r/api/src", "/r/api.feat"]), { timeout: 60_000 }],
      ]);
    }),
  );

  it.effect("no folders: no repos, and nothing is run", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/x\t1\n", stderr: "" });
      const repos = yield* reposOf([]).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual([repos, calls], [[], []]);
    }),
  );
});

describe("failureText", () => {
  test("a failed run is the last line of its errors", () => {
    const failed = new CommandFailed({
      command: "wt list",
      code: 1,
      stderr: "warming up\nnot a git repo\n\n",
    });
    expect(failureText(failed)).toBe("not a git repo");
  });

  test("a failed run with no errors names the run and its exit code", () => {
    const failed = new CommandFailed({ command: "wt list", code: 127, stderr: " \n" });
    expect(failureText(failed)).toBe("wt list failed (exit 127)");
  });

  test("a program that couldn't start says why", () => {
    expect(failureText(new ShellError({ cause: new Error("sh: not found") }))).toBe(
      "couldn't start: sh: not found",
    );
    expect(failureText(new ShellError({ cause: "no such folder" }))).toBe(
      "couldn't start: no such folder",
    );
  });

  test("output that couldn't be read says why", () => {
    expect(
      failureText(new ListUnreadable({ message: "wt list printed no list of worktrees" })),
    ).toBe("wt list printed no list of worktrees");
  });
});
