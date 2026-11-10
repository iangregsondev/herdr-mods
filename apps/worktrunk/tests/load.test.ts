import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Result } from "effect";
import { Files, type FilesApi } from "../src/files.ts";
import {
  findRepos,
  hideInSettings,
  loadSettings,
  newWorktree,
  readCi,
  readEach,
  readList,
  runJob,
  syncToast,
} from "../src/load.ts";
import { newScript } from "../src/commands.ts";
import { parseList } from "../src/worktrees.ts";
import ci from "./fixtures/ci.json?raw";
import states from "./fixtures/states.json?raw";
import { Shell, type ExecApi } from "../src/shell.ts";
import { DEFAULT_SETTINGS, serializeSettings } from "../src/settings.ts";

/** `hc` for fakes of tests that never call it. */
const noHc: ExecApi["hc"] = () => Promise.reject(new Error("hc isn't called here"));

const FILES = {
  path: "/app/iangregsondev-worktrunk.json",
  name: "iangregsondev-worktrunk.json",
  legacyPath: "/app/worktrunk.json",
};

const WORK = JSON.stringify({ folders: [{ name: "Work", path: "~/w" }], depth: 2, skip: [] });

/** A Herdr API over `disk` (path to text) that records what it reads and creates. */
const disk = (files: Readonly<Record<string, string>>) => {
  const reads: string[] = [];
  const writes: unknown[] = [];
  const api: FilesApi = {
    readTextFile: (path) => {
      reads.push(path);
      return Promise.resolve(files[path] ?? null);
    },
    writeTextFile: (path, text, expected) => {
      writes.push([path, text, expected]);
      return Promise.resolve(null);
    },
  };
  return { api, reads, writes };
};

describe("loadSettings", () => {
  it.effect("reads the settings file, which settles the import", () =>
    Effect.gen(function* () {
      const { api } = disk({ [FILES.path]: WORK });
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded, {
        parsed: {
          settings: {
            folders: [{ name: "Work", path: "~/w" }],
            depth: 2,
            skip: [],
            hidden: [],
            noWrapper: false,
          },
          error: Option.none(),
        },
        settled: true,
      });
    }),
  );

  it.effect("with no settings file, copies the old mod's into a new one, once", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.legacyPath]: WORK });
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded.settled, true);
      assert.deepStrictEqual(loaded.parsed.settings.folders, [{ name: "Work", path: "~/w" }]);
      assert.deepStrictEqual(writes, [
        [FILES.path, serializeSettings(loaded.parsed.settings), null],
      ]);
    }),
  );

  it.effect("once settled, the old mod's file is never read again", () =>
    Effect.gen(function* () {
      const { api, reads, writes } = disk({ [FILES.legacyPath]: WORK });
      const loaded = yield* loadSettings(FILES, true).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded, {
        parsed: { settings: DEFAULT_SETTINGS, error: Option.none() },
        settled: true,
      });
      assert.deepStrictEqual([reads, writes], [[FILES.path], []]);
    }),
  );

  it.effect("with neither file, the defaults, and the import stays open", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({});
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded, {
        parsed: { settings: DEFAULT_SETTINGS, error: Option.none() },
        settled: false,
      });
      assert.deepStrictEqual(writes, []);
    }),
  );

  it.effect("a settings file that can't be read gives the defaults and says why", () =>
    Effect.gen(function* () {
      const api: FilesApi = { ...disk({}).api, readTextFile: () => Promise.reject("EACCES") };
      const loaded = yield* loadSettings(FILES, true).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded, {
        parsed: {
          settings: DEFAULT_SETTINGS,
          error: Option.some("iangregsondev-worktrunk.json: couldn't read it (EACCES)"),
        },
        settled: true,
      });
    }),
  );

  it.effect(
    "an old mod's file that can't be read gives the defaults, says why, settles nothing",
    () =>
      Effect.gen(function* () {
        const api: FilesApi = {
          ...disk({}).api,
          readTextFile: (path) =>
            path === FILES.legacyPath ? Promise.reject("EIO") : Promise.resolve(null),
        };
        const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
        assert.deepStrictEqual(loaded, {
          parsed: {
            settings: DEFAULT_SETTINGS,
            error: Option.some("worktrunk.json: couldn't read it (EIO)"),
          },
          settled: false,
        });
      }),
  );

  it.effect("a new settings file that can't be created gives the defaults and says why", () =>
    Effect.gen(function* () {
      const { api } = disk({ [FILES.legacyPath]: WORK });
      const refusing: FilesApi = { ...api, writeTextFile: () => Promise.reject("EROFS") };
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(refusing)));
      assert.deepStrictEqual(loaded, {
        parsed: {
          settings: DEFAULT_SETTINGS,
          error: Option.some(
            "iangregsondev-worktrunk.json: couldn't create it from worktrunk.json (EROFS)",
          ),
        },
        settled: false,
      });
    }),
  );

  it.effect("a settings file made meanwhile wins over the copy, and settles the import", () =>
    Effect.gen(function* () {
      const files: Record<string, string> = { [FILES.legacyPath]: WORK };
      const api: FilesApi = {
        readTextFile: (path) => Promise.resolve(files[path] ?? null),
        // Someone else writes the settings file first, so Herdr refuses to create it.
        writeTextFile: (path) => {
          files[path] = '{"depth": 7}';
          return Promise.reject(new Error("stale"));
        },
      };
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded, {
        parsed: { settings: { ...DEFAULT_SETTINGS, depth: 7 }, error: Option.none() },
        settled: true,
      });
    }),
  );
});

/** A Herdr API whose `exec` answers each script by a word in it, recording the scripts run. */
const scripts = (answers: { readonly scan?: string; readonly owners?: string }) => {
  const ran: string[] = [];
  const api: ExecApi = {
    hc: noHc,
    exec: (_command, args = []) => {
      const body = args[1] ?? "";
      const which = body.includes("walk()")
        ? "scan"
        : body.includes("git-common-dir")
          ? "owners"
          : "?";
      ran.push(which);
      const stdout =
        which === "scan" ? answers.scan : which === "owners" ? answers.owners : undefined;
      return Promise.resolve(
        stdout === undefined
          ? { code: 1, stdout: "", stderr: `no ${which}` }
          : { code: 0, stdout, stderr: "" },
      );
    },
  };
  return { api, ran };
};

describe("findRepos", () => {
  const settings = { ...DEFAULT_SETTINGS, folders: [{ name: "Work", path: "/w" }] };

  it.effect("scans the group folders and adds the open spaces' repos", () =>
    Effect.gen(function* () {
      const { api } = scripts({ scan: "/w\t/w/zed\t1\n", owners: "/tmp/api\t2\n" });
      const found = yield* findRepos(settings, "/h", ["/tmp/api/src"], Option.none()).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        found,
        Result.succeed({
          scanned: [{ root: "/w/zed", count: 1 }],
          repos: [
            { root: "/tmp/api", count: 2, group: "Other" },
            { root: "/w/zed", count: 1, group: "Work" },
          ],
        }),
      );
    }),
  );

  it.effect("leaves out hidden repos, found by the scan or by an open space", () =>
    Effect.gen(function* () {
      const { api } = scripts({ scan: "/w\t/w/zed\t1\n/w\t/w/old\t1\n", owners: "/tmp/api\t2\n" });
      const hiding = { ...settings, hidden: ["/w/old", "/tmp/api"] };
      const found = yield* findRepos(hiding, "/h", ["/tmp/api"], Option.none()).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        Result.map(found, (f) => f.repos.map((repo) => repo.root)),
        Result.succeed(["/w/zed"]),
      );
    }),
  );

  it.effect("with no scan due, keeps the last scan and runs only the open spaces' lookup", () =>
    Effect.gen(function* () {
      const { api, ran } = scripts({ scan: "/w\t/w/new\t1\n", owners: "" });
      const last = [{ root: "/w/zed", count: 3 }];
      const found = yield* findRepos(settings, "/h", ["/tmp"], Option.some(last)).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        found,
        Result.succeed({ scanned: last, repos: [{ root: "/w/zed", count: 3, group: "Work" }] }),
      );
      assert.deepStrictEqual(ran, ["owners"]);
    }),
  );

  it.effect("a search that fails is its one-line reason", () =>
    Effect.gen(function* () {
      const { api } = scripts({ owners: "" });
      const found = yield* findRepos(settings, "/h", [], Option.none()).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(found, Result.fail("no scan"));
    }),
  );
});

describe("readList", () => {
  it.effect("a repo's worktrees, from wt list", () =>
    Effect.gen(function* () {
      const api: ExecApi = {
        exec: () => Promise.resolve({ code: 0, stdout: states, stderr: "" }),
        hc: noHc,
      };
      const list = yield* readList("/work/repo").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(list, parseList(states));
    }),
  );

  it.effect("a read that fails is its one-line reason", () =>
    Effect.gen(function* () {
      const api: ExecApi = {
        hc: noHc,
        exec: () =>
          Promise.resolve({ code: 1, stdout: "", stderr: "fatal: not a git repository\n" }),
      };
      const list = yield* readList("/gone").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(list, Result.fail("fatal: not a git repository"));
    }),
  );
});

describe("readCi", () => {
  it.effect("a repo's worktrees with their CI, from wt list --full", () =>
    Effect.gen(function* () {
      // wt answers with CI only when asked for it.
      const api: ExecApi = {
        hc: noHc,
        exec: (_command, args = []) =>
          Promise.resolve({
            code: 0,
            stdout: (args[1] ?? "").includes("--full") ? ci : states,
            stderr: "",
          }),
      };
      const read = yield* readCi("/work/repo").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(read, parseList(ci));
    }),
  );
});

describe("readEach", () => {
  it.effect("hands each repo's answer on as it lands", () =>
    Effect.gen(function* () {
      const kept: unknown[] = [];
      yield* readEach(
        ["/r/a", "/r/b", "/r/c"],
        2,
        (root) => Effect.succeed(root.toUpperCase()),
        (root, answer) => kept.push([root, answer]),
      );
      assert.deepStrictEqual(kept, [
        ["/r/a", "/R/A"],
        ["/r/b", "/R/B"],
        ["/r/c", "/R/C"],
      ]);
    }),
  );

  it.effect("runs at most limit reads at once, and keeps that many going", () =>
    Effect.gen(function* () {
      const running = { now: 0, most: 0 };
      const read = () =>
        Effect.gen(function* () {
          running.now += 1;
          running.most = Math.max(running.most, running.now);
          // Lets the other reads start before this one ends.
          yield* Effect.yieldNow;
          running.now -= 1;
        });
      yield* readEach(["/a", "/b", "/c", "/d", "/e"], 2, read, () => undefined);
      assert.strictEqual(running.most, 2);
    }),
  );
});

describe("syncToast", () => {
  const RECORD = "/app/iangregsondev-sync.json";
  const built = (version: string) =>
    JSON.stringify({ layout: "iangregsondev", from: "main", version });

  it.effect("the toast for a record of an older Herdr, read through Files", () =>
    Effect.gen(function* () {
      const { api, reads } = disk({ [RECORD]: built("0.1.12") });
      const toast = yield* syncToast(RECORD, "0.1.14", undefined).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual(
        Option.map(toast, (notice) => notice.title),
        Option.some("Herdr updated: run herdr:sync"),
      );
      assert.deepStrictEqual(reads, [RECORD]);
    }),
  );

  it.effect("no record file, no toast", () =>
    Effect.gen(function* () {
      const { api } = disk({});
      const toast = yield* syncToast(RECORD, "0.1.14", undefined).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual(toast, Option.none());
    }),
  );

  it.effect("a record that can't be read, no toast", () =>
    Effect.gen(function* () {
      const api: FilesApi = { ...disk({}).api, readTextFile: () => Promise.reject("denied") };
      const toast = yield* syncToast(RECORD, "0.1.14", undefined).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual(toast, Option.none());
    }),
  );
});

describe("hideInSettings", () => {
  it.effect("adds the repo to the hidden list, over the file as it was read", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.path]: WORK });
      const hid = yield* hideInSettings(FILES, "/w/api").pipe(Effect.provide(Files.layer(api)));
      const hidden = serializeSettings({
        ...DEFAULT_SETTINGS,
        folders: [{ name: "Work", path: "~/w" }],
        depth: 2,
        skip: [],
        hidden: ["/w/api"],
      });
      assert.deepStrictEqual(
        [hid, writes],
        [Result.succeed(undefined), [[FILES.path, hidden, WORK]]],
      );
    }),
  );

  it.effect("with no settings file yet, creates one hiding the repo", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({});
      const hid = yield* hideInSettings(FILES, "/w/api").pipe(Effect.provide(Files.layer(api)));
      const made = serializeSettings({ ...DEFAULT_SETTINGS, hidden: ["/w/api"] });
      assert.deepStrictEqual(
        [hid, writes],
        [Result.succeed(undefined), [[FILES.path, made, null]]],
      );
    }),
  );

  it.effect("a repo already hidden writes nothing", () =>
    Effect.gen(function* () {
      const file = serializeSettings({ ...DEFAULT_SETTINGS, hidden: ["/w/api"] });
      const { api, writes } = disk({ [FILES.path]: file });
      const hid = yield* hideInSettings(FILES, "/w/api").pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual([hid, writes], [Result.succeed(undefined), []]);
    }),
  );

  it.effect("a file that doesn't parse is left alone, and the answer says why", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.path]: '{"depth": "4"}' });
      const hid = yield* hideInSettings(FILES, "/w/api").pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        [hid, writes],
        [Result.fail('iangregsondev-worktrunk.json: "depth" must be a number'), []],
      );
    }),
  );

  it.effect("a hand edit made meanwhile is never written over: the answer says try again", () =>
    Effect.gen(function* () {
      const files: Record<string, string> = { [FILES.path]: WORK };
      const api: FilesApi = {
        readTextFile: (path) => Promise.resolve(files[path] ?? null),
        // The person saves the file between the read and the write.
        writeTextFile: (path) => {
          files[path] = "{}";
          return Promise.reject(new Error("stale"));
        },
      };
      const hid = yield* hideInSettings(FILES, "/w/api").pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        hid,
        Result.fail("iangregsondev-worktrunk.json changed while hiding the repo: try again."),
      );
    }),
  );

  it.effect("a file that can't be read or written: the answer names the file and the cause", () =>
    Effect.gen(function* () {
      const api: FilesApi = {
        readTextFile: () => Promise.resolve(WORK),
        writeTextFile: () => Promise.reject(new Error("disk full")),
      };
      const hid = yield* hideInSettings(FILES, "/w/api").pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        hid,
        Result.fail("iangregsondev-worktrunk.json: couldn't save it (disk full)"),
      );
    }),
  );
});

/**
 * A Herdr API for jobs: `exec` answers the $SHELL read and the removed folders' check
 * (printing `gone`), `hc` answers `run` with `started` and each `wait` with `waits` in
 * turn. Every call is logged in order.
 */
const jobApi = (options: {
  readonly started?: string;
  readonly waits?: readonly string[];
  readonly gone?: string;
  readonly goneFails?: boolean;
}) => {
  const log: unknown[] = [];
  const waits = [...(options.waits ?? ['{"ended":true,"exit_code":0}'])];
  const api: ExecApi = {
    exec: (command, args = []) => {
      const isGone = args[1]?.includes('[ -e "$dir" ]') ?? false;
      log.push(isGone ? ["gone", ...args.slice(3)] : [command, ...args]);
      if (isGone && options.goneFails === true) {
        return Promise.resolve({ code: 1, stdout: "", stderr: "no" });
      }
      return Promise.resolve({
        code: 0,
        stdout: isGone ? (options.gone ?? "") : "/bin/zsh",
        stderr: "",
      });
    },
    hc: (args) => {
      log.push(["hc", args[0]]);
      const stdout =
        args[0] === "run"
          ? (options.started ?? '{"address":"t4g"}')
          : args[0] === "wait"
            ? (waits.shift() ?? "")
            : "";
      return Promise.resolve({
        code: 0,
        stdout,
        stderr: args[0] === "run" ? "no such folder" : "",
      });
    },
  };
  return { api, log };
};

const MERGE_JOB = {
  title: "Merge feat into main",
  cwd: "/r/app",
  body: "wt merge",
  gone: ["/r/app.feat", "/r/app.other"],
};

describe("runJob", () => {
  it.effect(
    "starts it, shows its window, waits for it, removes its terminal, checks its folders",
    () =>
      Effect.gen(function* () {
        const { api, log } = jobApi({
          waits: ['{"ended":false}', '{"ended":true,"exit_code":0}'],
          gone: "/r/app.feat\n",
        });
        const shown: string[] = [];
        const outcome = yield* runJob(MERGE_JOB, (addr) => {
          shown.push(addr);
          log.push(["shown", addr]);
        }).pipe(Effect.provide(Shell.layer(api)));
        assert.deepStrictEqual(outcome, {
          _tag: "Ended",
          code: Option.some(0),
          gone: ["/r/app.feat"],
        });
        assert.deepStrictEqual(log, [
          ["sh", "-c", 'printf %s "$SHELL"'],
          ["hc", "run"],
          ["shown", "t4g"],
          ["hc", "wait"],
          ["hc", "wait"],
          ["hc", "rm"],
          ["gone", "/r/app.feat", "/r/app.other"],
        ]);
      }),
  );

  it.effect("a job that never started says why, and nothing more runs", () =>
    Effect.gen(function* () {
      const { api, log } = jobApi({ started: "oops" });
      const shown: string[] = [];
      const outcome = yield* runJob(MERGE_JOB, (addr) => shown.push(addr)).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        [outcome, shown, log.slice(1)],
        [{ _tag: "NotStarted", reason: "no such folder" }, [], [["hc", "run"]]],
      );
    }),
  );

  it.effect("a removed folders' check that fails closes nothing, but the job still ended", () =>
    Effect.gen(function* () {
      const { api } = jobApi({ goneFails: true });
      const outcome = yield* runJob(MERGE_JOB, () => undefined).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(outcome, { _tag: "Ended", code: Option.some(0), gone: [] });
    }),
  );

  it.effect(
    "hc failing while it waits loses the job: it ended with no code, and its folders are checked",
    () =>
      Effect.gen(function* () {
        const { api, log } = jobApi({ gone: "/r/app.feat\n" });
        const failingWait: ExecApi = {
          ...api,
          hc: (args) => (args[0] === "wait" ? Promise.reject("hc crashed") : api.hc(args)),
        };
        const outcome = yield* runJob(MERGE_JOB, () => undefined).pipe(
          Effect.provide(Shell.layer(failingWait)),
        );
        assert.deepStrictEqual(outcome, {
          _tag: "Ended",
          code: Option.none(),
          gone: ["/r/app.feat"],
        });
        assert.deepStrictEqual(log.at(-2), ["hc", "rm"]);
      }),
  );
});

describe("newWorktree", () => {
  const TARGET = { main: "/r/app", name: "feat", base: null };

  /** The job API, plus mktemp and rm in `exec`, and wt's answer file on a fake disk. */
  const newApi = (options: { readonly code?: number; readonly mktemp?: string } = {}) => {
    const jobs = jobApi({ waits: [`{"ended":true,"exit_code":${options.code ?? 0}}`] });
    const bodies: string[] = [];
    const exec: ExecApi["exec"] = (command, args = []) => {
      if (command === "mktemp") {
        jobs.log.push(["mktemp"]);
        return Promise.resolve({ code: 0, stdout: options.mktemp ?? "/tmp/t1\n", stderr: "" });
      }
      if (command === "rm") {
        jobs.log.push(["rm", ...args]);
        return Promise.resolve({ code: 0, stdout: "", stderr: "" });
      }
      return jobs.api.exec(command, args);
    };
    const hc: ExecApi["hc"] = (args) => {
      if (args[0] === "run") bodies.push(args.at(-1) ?? "");
      return jobs.api.hc(args);
    };
    const files = disk({ "/tmp/t1/switch.json": '{"branch":"feat","path":"/r/app.feat"}' });
    const layer = Layer.mergeAll(Shell.layer({ exec, hc }), Files.layer(files.api));
    return { layer, log: jobs.log, bodies };
  };

  it.effect("runs wt switch as a job, reads its answer, then removes the temp folder", () =>
    Effect.gen(function* () {
      const { layer, log, bodies } = newApi();
      const made = yield* newWorktree(TARGET, () => undefined).pipe(Effect.provide(layer));
      assert.deepStrictEqual(made, {
        outcome: { _tag: "Ended", code: Option.some(0), gone: [] },
        switched: Option.some({ branch: "feat", path: "/r/app.feat" }),
      });
      assert.deepStrictEqual(bodies, [
        newScript({
          main: "/r/app",
          name: "feat",
          base: Option.none(),
          out: "/tmp/t1/switch.json",
        }),
      ]);
      assert.deepStrictEqual([log[0], log.at(-1)], [["mktemp"], ["rm", "-rf", "/tmp/t1"]]);
    }),
  );

  it.effect("a job that failed reads no answer, and the temp folder still goes", () =>
    Effect.gen(function* () {
      const { layer, log } = newApi({ code: 1 });
      const made = yield* newWorktree(TARGET, () => undefined).pipe(Effect.provide(layer));
      assert.deepStrictEqual(made, {
        outcome: { _tag: "Ended", code: Option.some(1), gone: [] },
        switched: Option.none(),
      });
      assert.deepStrictEqual(log.at(-1), ["rm", "-rf", "/tmp/t1"]);
    }),
  );

  it.effect("no temp folder: the job never starts, and the answer says why", () =>
    Effect.gen(function* () {
      const { layer, log } = newApi({ mktemp: "" });
      const made = yield* newWorktree(TARGET, () => undefined).pipe(Effect.provide(layer));
      assert.deepStrictEqual(made, {
        outcome: {
          _tag: "NotStarted",
          reason: "couldn't make a temp folder: mktemp printed no folder",
        },
        switched: Option.none(),
      });
      assert.deepStrictEqual(log, [["mktemp"]]);
    }),
  );
});
