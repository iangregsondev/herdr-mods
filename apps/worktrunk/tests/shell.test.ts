import { assert, describe, expect, it, test } from "@effect/vitest";
import { Effect, Option, Result } from "effect";
import {
  CI_SCRIPT,
  GONE_SCRIPT,
  jobArgs,
  LIST_SCRIPT,
  OWNERS_SCRIPT,
  SCAN_SCRIPT,
  scanArgs,
  shArgs,
} from "../src/commands.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import {
  CommandFailed,
  failureText,
  goneFolders,
  ListUnreadable,
  loginShell,
  makeTempDir,
  removeDir,
  repoAt,
  removeTerminal,
  reposOf,
  reveal,
  runScript,
  scanRepos,
  Shell,
  startJob,
  stopJob,
  waitForJob,
  ShellError,
  wtCi,
  wtList,
  type ExecApi,
} from "../src/shell.ts";
import { parseList } from "../src/worktrees.ts";
import ci from "./fixtures/ci.json?raw";
import states from "./fixtures/states.json?raw";

/** `hc` for fakes of tests that never call it. */
const noHc: ExecApi["hc"] = () => Promise.reject(new Error("hc isn't called here"));

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
  hc: noHc,
});

describe("Shell.hc", () => {
  it.effect("runs herdr-core with the arguments and gives its answer, whatever its exit code", () =>
    Effect.gen(function* () {
      const calls: unknown[] = [];
      const api: ExecApi = {
        exec: () => Promise.reject(new Error("exec isn't called here")),
        hc: (args) => {
          calls.push(args);
          return Promise.resolve({ code: 1, stdout: '{"ended":false}', stderr: "" });
        },
      };
      const run = yield* Effect.gen(function* () {
        const shell = yield* Shell;
        return yield* shell.hc(["wait", "t1", "--json"]);
      }).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        [run, calls],
        [{ code: 1, stdout: '{"ended":false}', stderr: "" }, [["wait", "t1", "--json"]]],
      );
    }),
  );

  it.effect("hc that can't run is ShellError, with the cause", () =>
    Effect.gen(function* () {
      const shell = yield* Shell;
      const result = yield* Effect.result(shell.hc(["ls"]));
      assert.deepStrictEqual(failureOf(result), Result.fail(["ShellError", "no herdr-core"]));
    }).pipe(
      Effect.provide(
        Shell.layer({
          exec: () => Promise.reject(new Error("exec isn't called here")),
          hc: () => Promise.reject("no herdr-core"),
        }),
      ),
    ),
  );
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
    }).pipe(
      Effect.provide(Shell.layer({ exec: () => Promise.reject("no such program"), hc: noHc })),
    ),
  );
});

describe("Shell.exec", () => {
  it.effect("a run that exits 0 is its result, run as asked", () =>
    Effect.gen(function* () {
      const calls: unknown[] = [];
      const api: ExecApi = {
        hc: noHc,
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
    hc: noHc,
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

  it.effect("a slow script runs for as long as it asks", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "", stderr: "" });
      yield* runScript("slow", "sleep 1", [], 240_000).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(calls, [["sh", shArgs("sleep 1", []), { timeout: 240_000 }]]);
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

describe("wtCi", () => {
  it.effect("the worktrees and their CI, from wt list --full, for up to 4 minutes", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: ci, stderr: "" });
      const worktrees = yield* wtCi("/work/repo").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(worktrees, Result.getOrThrow(parseList(ci)));
      assert.deepStrictEqual(calls, [
        ["sh", shArgs(CI_SCRIPT, ["/work/repo"]), { timeout: 240_000 }],
      ]);
    }),
  );

  it.effect("a CI read that fails is CommandFailed, named wt list --full", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(wtCi("/r"));
      assert.deepStrictEqual(
        failureOf(result),
        Result.fail(["CommandFailed", "wt list --full", 1, "rate limited"]),
      );
    }).pipe(
      Effect.provide(Shell.layer(answering({ code: 1, stdout: "", stderr: "rate limited" }))),
    ),
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

describe("repoAt", () => {
  it.effect("the repo the folder is in, from the owners script", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/r/api\t3\n", stderr: "" });
      const found = yield* repoAt("/r/api.feat/src").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(found, Option.some({ root: "/r/api", count: 3 }));
      assert.deepStrictEqual(calls, [
        ["sh", shArgs(OWNERS_SCRIPT, ["/r/api.feat/src"]), { timeout: 60_000 }],
      ]);
    }),
  );

  it.effect("no folder (nothing focused): none, and nothing is run", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/r/api\t3\n", stderr: "" });
      const found = yield* repoAt("").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual([found, calls], [Option.none(), []]);
    }),
  );

  it.effect("a folder in no repo: none", () =>
    Effect.gen(function* () {
      const found = yield* repoAt("/tmp/x");
      assert.deepStrictEqual(found, Option.none());
    }).pipe(Effect.provide(Shell.layer(answering({ code: 0, stdout: "", stderr: "" })))),
  );

  it.effect("a lookup that fails is CommandFailed, naming it", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(repoAt("/r/api"));
      assert.deepStrictEqual(
        failureOf(result),
        Result.fail(["CommandFailed", "the Current repo's lookup", 2, "sh: boom"]),
      );
    }).pipe(Effect.provide(Shell.layer(answering({ code: 2, stdout: "", stderr: "sh: boom" })))),
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

describe("loginShell", () => {
  it.effect("the person's shell, from $SHELL", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/bin/zsh", stderr: "" });
      const shell = yield* loginShell().pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        [shell, calls],
        ["/bin/zsh", [["sh", ["-c", 'printf %s "$SHELL"'], undefined]]],
      );
    }),
  );

  it.effect("/bin/sh when $SHELL is empty or can't be read", () =>
    Effect.gen(function* () {
      const empty = yield* loginShell().pipe(
        Effect.provide(Shell.layer(answering({ code: 0, stdout: " ", stderr: "" }))),
      );
      const failed = yield* loginShell().pipe(
        Effect.provide(Shell.layer({ exec: () => Promise.reject("no sh"), hc: noHc })),
      );
      assert.deepStrictEqual([empty, failed], ["/bin/sh", "/bin/sh"]);
    }),
  );
});

/** A Herdr API whose `hc` records each call and answers from `answers`, in turn. */
const hcAnswering = (answers: readonly string[], stderr = "") => {
  const calls: (readonly string[])[] = [];
  const api: ExecApi = {
    exec: () => Promise.reject(new Error("exec isn't called here")),
    hc: (args) => {
      calls.push(args);
      return Promise.resolve({ code: 0, stdout: answers[calls.length - 1] ?? "", stderr });
    },
  };
  return { api, calls };
};

describe("startJob", () => {
  const job = { cwd: "/r/app", shell: "/bin/zsh", body: "wt list" };

  it.effect("starts the job as a background terminal; its address", () =>
    Effect.gen(function* () {
      const { api, calls } = hcAnswering(['{"address":"t4g","state":"live"}']);
      const addr = yield* startJob(job).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual([addr, calls], ["t4g", [jobArgs(job)]]);
    }),
  );

  it.effect("no address printed: JobNotStarted, saying why in hc's last line", () =>
    Effect.gen(function* () {
      const { api } = hcAnswering(["oops"], "warming up\nno such folder: /r/app\n");
      const error = yield* Effect.flip(startJob(job).pipe(Effect.provide(Shell.layer(api))));
      assert.deepStrictEqual(
        [error._tag, "reason" in error ? error.reason : ""],
        ["JobNotStarted", "no such folder: /r/app"],
      );
    }),
  );
});

describe("waitForJob", () => {
  it.effect("waits a minute at a time until the job ends; its exit code", () =>
    Effect.gen(function* () {
      const running = '{"ended":false,"terminal":"t4g"}';
      const { api, calls } = hcAnswering([running, running, '{"ended":true,"exit_code":3}']);
      const code = yield* waitForJob("t4g").pipe(Effect.provide(Shell.layer(api)));
      const wait = ["wait", "t4g", "--json", "--timeout", "60"];
      assert.deepStrictEqual([code, calls], [Option.some(3), [wait, wait, wait]]);
    }),
  );

  it.effect("a terminal that is gone, or hc with no answer, lost the job", () =>
    Effect.gen(function* () {
      const { api } = hcAnswering(['{"ended":false}', "no such terminal: t4g"]);
      const code = yield* waitForJob("t4g").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(code, Option.none());
    }),
  );
});

describe("goneFolders", () => {
  it.effect("the folders among these that no longer exist", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/r/a\n/r/b c\n", stderr: "" });
      const gone = yield* goneFolders(["/r/a", "/r/b c", "/r/d"]).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        [gone, calls],
        [
          ["/r/a", "/r/b c"],
          [["sh", shArgs(GONE_SCRIPT, ["/r/a", "/r/b c", "/r/d"]), { timeout: 60_000 }]],
        ],
      );
    }),
  );

  it.effect("no folders: nothing gone, and nothing run", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/r/a\n", stderr: "" });
      const gone = yield* goneFolders([]).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual([gone, calls], [[], []]);
    }),
  );
});

describe("stopJob", () => {
  it.effect("kills the job's terminal", () =>
    Effect.gen(function* () {
      const { api, calls } = hcAnswering([""]);
      yield* stopJob("t4g").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(calls, [["kill", "t4g"]]);
    }),
  );
});

describe("removeTerminal", () => {
  it.effect("removes the ended job's terminal from herdr-core", () =>
    Effect.gen(function* () {
      const { api, calls } = hcAnswering([""]);
      yield* removeTerminal("t4g").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(calls, [["rm", "t4g"]]);
    }),
  );
});

describe("reveal", () => {
  it.effect("opens the folder in the Finder", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "", stderr: "" });
      yield* reveal("/r/my app").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(calls, [["open", ["/r/my app"], undefined]]);
    }),
  );
});

describe("makeTempDir", () => {
  it.effect("makes a private temp folder; its path", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "/tmp/tmp.x1\n", stderr: "" });
      const dir = yield* makeTempDir().pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual([dir, calls], ["/tmp/tmp.x1", [["mktemp", ["-d"], undefined]]]);
    }),
  );

  it.effect("mktemp printing no folder failed: CommandFailed, naming it", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        makeTempDir().pipe(
          Effect.provide(Shell.layer(answering({ code: 0, stdout: "\n", stderr: "" }))),
        ),
      );
      assert.deepStrictEqual(
        failureOf(result),
        Result.fail(["CommandFailed", "mktemp", 0, "mktemp printed no folder"]),
      );
    }),
  );
});

describe("removeDir", () => {
  it.effect("removes the folder and what is in it", () =>
    Effect.gen(function* () {
      const { api, calls } = recording({ code: 0, stdout: "", stderr: "" });
      yield* removeDir("/tmp/tmp.x1").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(calls, [["rm", ["-rf", "/tmp/tmp.x1"], undefined]]);
    }),
  );
});
