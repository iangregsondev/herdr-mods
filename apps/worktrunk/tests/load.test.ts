import { assert, describe, it } from "@effect/vitest";
import { Effect, Option, Result } from "effect";
import { Files, type FilesApi } from "../src/files.ts";
import { findRepos, loadSettings, readCi, readEach, readList, syncToast } from "../src/load.ts";
import { parseList } from "../src/worktrees.ts";
import ci from "./fixtures/ci.json?raw";
import states from "./fixtures/states.json?raw";
import { Shell, type ExecApi } from "../src/shell.ts";
import { DEFAULT_SETTINGS, serializeSettings } from "../src/settings.ts";

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
          settings: { folders: [{ name: "Work", path: "~/w" }], depth: 2, skip: [] },
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
      const api: ExecApi = { exec: () => Promise.resolve({ code: 0, stdout: states, stderr: "" }) };
      const list = yield* readList("/work/repo").pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(list, parseList(states));
    }),
  );

  it.effect("a read that fails is its one-line reason", () =>
    Effect.gen(function* () {
      const api: ExecApi = {
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
