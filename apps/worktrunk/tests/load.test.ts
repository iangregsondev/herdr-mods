import { assert, describe, it } from "@effect/vitest";
import { machineStates, THIS_MACHINE } from "../src/machines.ts";
import { Effect, Exit, Fiber, Layer, Option, Result } from "effect";
import { Files, type FilesApi } from "worktrunk-mailbox";
import {
  addGroupFolderOn,
  defectAsReason,
  dialogFor,
  foundOf,
  hideInSettings,
  landSearch,
  loadSettings,
  lookUpCurrent,
  newWorktree,
  pickGroupFolder,
  readCi,
  readDialogRepo,
  readEach,
  readList,
  readLists,
  refreshMachines,
  runJob,
  scanKey,
  saveSettings,
  settingsText,
  spaceWorktree,
  syncToast,
  type Landed,
  type MachineSearch,
  type Searches,
} from "../src/load.ts";
import { newScript } from "../src/commands.ts";
import { parseList } from "../src/worktrees.ts";
import ci from "./fixtures/ci.json?raw";
import states from "./fixtures/states.json?raw";
import { Shell, type ExecApi } from "../src/shell.ts";
import type { MachineLists } from "../src/reads.ts";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
  type Settings,
} from "../src/settings.ts";
import type { Located, MachineStates } from "../src/machines.ts";
import type { FoundRepo } from "../src/repos.ts";

/** A repo on this machine. */
const here = (root: string) => ({ machine: THIS_MACHINE, root });

/** A folder on this machine. */
const local = (folder: string) => ({ machine: THIS_MACHINE, folder });

/** The folder picker for fakes of tests that never open it. */
const noPicker: FilesApi["pickFolder"] = () => Promise.reject(new Error("no picker here"));

/** `exec` for fakes of tests that never delete a file. */
const noExec: FilesApi["exec"] = () => Promise.reject(new Error("exec isn't called here"));

/** `hc` for fakes of tests that never call it. */
const noHc: ExecApi["hc"] = () => Promise.reject(new Error("hc isn't called here"));

const FILES = {
  path: "/app/iangregsondev-worktrunk.json",
  name: "iangregsondev-worktrunk.json",
  legacyPath: "/app/worktrunk.json",
};

const WORK = JSON.stringify({ folders: [{ name: "Work", path: "~/w" }], depth: 2, skip: [] });

/** `exec` that removes each file it is asked to (`rm -f -- <path>`), recording the paths. */
const removing =
  (removed: string[]): FilesApi["exec"] =>
  (_command, args = []) => {
    removed.push(args.at(-1) ?? "");
    return Promise.resolve({ code: 0, stdout: "", stderr: "" });
  };

/** A Herdr API over `disk` (path to text) that records what it reads, creates and removes. */
const disk = (files: Readonly<Record<string, string>>) => {
  const reads: string[] = [];
  const writes: unknown[] = [];
  const removed: string[] = [];
  const api: FilesApi = {
    readTextFile: (path) => {
      reads.push(path);
      return Promise.resolve(files[path] ?? null);
    },
    writeTextFile: (path, text, expected) => {
      writes.push([path, text, expected]);
      return Promise.resolve(null);
    },
    pickFolder: noPicker,
    exec: removing(removed),
  };
  return { api, reads, writes, removed };
};

describe("loadSettings", () => {
  it.effect("reads the settings file, which settles the import", () =>
    Effect.gen(function* () {
      const { api } = disk({ [FILES.path]: WORK });
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded, {
        parsed: {
          settings: {
            folders: [{ name: "Work", path: "~/w", machine: THIS_MACHINE }],
            depth: 2,
            skip: [],
            hidden: [],
            noWrapper: false,
          },
          error: Option.none(),
        },
        settled: true,
        leftover: Option.none(),
      });
    }),
  );

  it.effect("with no settings file, copies the old mod's into a new one, once", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.legacyPath]: WORK });
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded.settled, true);
      assert.deepStrictEqual(loaded.parsed.settings.folders, [
        { name: "Work", path: "~/w", machine: THIS_MACHINE },
      ]);
      assert.deepStrictEqual(writes, [
        [FILES.path, serializeSettings(loaded.parsed.settings), null],
      ]);
    }),
  );

  it.effect("a successful import deletes the old mod's file", () =>
    Effect.gen(function* () {
      const { api, removed } = disk({ [FILES.legacyPath]: WORK });
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        [loaded.parsed.error, loaded.settled, removed],
        [Option.none(), true, [FILES.legacyPath]],
      );
    }),
  );

  it.effect("an old mod's file that can't be deleted keeps the import and says why", () =>
    Effect.gen(function* () {
      const { api } = disk({ [FILES.legacyPath]: WORK });
      const stuck: FilesApi = {
        ...api,
        exec: () => Promise.resolve({ code: 1, stdout: "", stderr: "Permission denied\n" }),
      };
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(stuck)));
      // The imported settings are fine and in use: the leftover file is a separate note.
      assert.deepStrictEqual(
        [loaded.parsed.settings.folders, loaded.parsed.error, loaded.leftover, loaded.settled],
        [
          [{ name: "Work", path: "~/w", machine: THIS_MACHINE }],
          Option.none(),
          Option.some("worktrunk.json: imported, but couldn't delete it (Permission denied)"),
          true,
        ],
      );
    }),
  );

  it.effect("once settled, the old mod's file is never read again", () =>
    Effect.gen(function* () {
      const { api, reads, writes } = disk({ [FILES.legacyPath]: WORK });
      const loaded = yield* loadSettings(FILES, true).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(loaded, {
        parsed: { settings: DEFAULT_SETTINGS, error: Option.none() },
        settled: true,
        leftover: Option.none(),
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
        leftover: Option.none(),
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
        leftover: Option.none(),
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
          leftover: Option.none(),
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
        leftover: Option.none(),
      });
    }),
  );

  it.effect("an import that fails leaves the old mod's file in place", () =>
    Effect.gen(function* () {
      const { api, removed } = disk({ [FILES.legacyPath]: WORK });
      const refusing: FilesApi = { ...api, writeTextFile: () => Promise.reject("EROFS") };
      yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(refusing)));
      assert.deepStrictEqual(removed, []);
    }),
  );

  it.effect("with no old mod's file, nothing is deleted", () =>
    Effect.gen(function* () {
      const { api, removed } = disk({});
      yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(removed, []);
    }),
  );

  it.effect("a settings file made meanwhile wins over the copy, and settles the import", () =>
    Effect.gen(function* () {
      const files: Record<string, string> = { [FILES.legacyPath]: WORK };
      const removed: string[] = [];
      const api: FilesApi = {
        readTextFile: (path) => Promise.resolve(files[path] ?? null),
        // Someone else writes the settings file first, so Herdr refuses to create it.
        writeTextFile: (path) => {
          files[path] = '{"depth": 7}';
          return Promise.reject(new Error("stale"));
        },
        pickFolder: noPicker,
        exec: removing(removed),
      };
      const loaded = yield* loadSettings(FILES, false).pipe(Effect.provide(Files.layer(api)));
      // Nothing was imported, so the old file stays.
      assert.deepStrictEqual(
        [loaded, removed],
        [
          {
            parsed: { settings: { ...DEFAULT_SETTINGS, depth: 7 }, error: Option.none() },
            settled: true,
            leftover: Option.none(),
          },
          [],
        ],
      );
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

/**
 * The repos to list, every machine searched at once through `refreshMachines`: scanned
 * again on every machine when `last` is none. This machine's failure is its reason.
 */
const findRepos = (
  settings: Settings,
  home: string,
  places: readonly Located[],
  last: Option.Option<Searches>,
  current: Option.Option<FoundRepo> = Option.none(),
  states: MachineStates = new Map(),
) =>
  Effect.gen(function* () {
    const start: Landed = {
      searches: Option.getOrElse(last, (): Searches => new Map()),
      error: Option.none(),
      statuses: new Map(),
    };
    const landed = { now: start };
    yield* refreshMachines(
      {
        settings,
        home,
        places,
        last: start.searches,
        rescan: Option.isNone(last),
        states,
        busy: new Set(),
      },
      (machine, search) => {
        landed.now = landSearch(landed.now, machine, search);
        return [];
      },
      () => undefined,
    );
    return Option.match(landed.now.error, {
      onSome: (reason) => Result.fail(reason),
      onNone: () => Result.succeed(foundOf(settings, home, places, landed.now.searches, current)),
    });
  });

/** The last searches: only `machine`'s, which scanned `scan` with `home` as its home. */
const searched = (
  machine: string | null,
  home: string,
  scan: { readonly repos: readonly FoundRepo[]; readonly missing: readonly string[] },
) => new Map([[machine, Result.succeed({ machine, home: Option.some(home), scan, owners: [] })]]);

describe("findRepos", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    folders: [{ name: "Work", path: "/w", machine: THIS_MACHINE }],
  };

  it.effect("scans the group folders and adds the open spaces' repos", () =>
    Effect.gen(function* () {
      const { api } = scripts({ scan: "/w\t/w/zed\t1\n", owners: "/tmp/api\t2\n" });
      const found = yield* findRepos(settings, "/h", [local("/tmp/api/src")], Option.none()).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        found,
        Result.succeed({
          scanned: {
            repos: [{ machine: THIS_MACHINE, root: "/w/zed", count: 1 }],
            missing: [],
            homes: new Map([[THIS_MACHINE, "/h"]]),
            machines: [THIS_MACHINE],
          },
          repos: [
            { machine: THIS_MACHINE, root: "/tmp/api", count: 2, group: "Other" },
            { machine: THIS_MACHINE, root: "/w/zed", count: 1, group: "Work" },
          ],
          statuses: new Map(),
        }),
      );
    }),
  );

  it.effect("leaves out hidden repos, found by the scan or by an open space", () =>
    Effect.gen(function* () {
      const { api } = scripts({ scan: "/w\t/w/zed\t1\n/w\t/w/old\t1\n", owners: "/tmp/api\t2\n" });
      const hiding = { ...settings, hidden: [here("/w/old"), here("/tmp/api")] };
      const found = yield* findRepos(hiding, "/h", [local("/tmp/api")], Option.none()).pipe(
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
      const scan = { repos: [{ machine: THIS_MACHINE, root: "/w/zed", count: 3 }], missing: [] };
      const last = searched(THIS_MACHINE, "/h", scan);
      const found = yield* findRepos(settings, "/h", [local("/tmp")], Option.some(last)).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        found,
        Result.succeed({
          scanned: {
            ...scan,
            homes: new Map([[THIS_MACHINE, "/h"]]),
            machines: [THIS_MACHINE],
          },
          repos: [{ machine: THIS_MACHINE, root: "/w/zed", count: 3, group: "Work" }],
          statuses: new Map(),
        }),
      );
      assert.deepStrictEqual(ran, ["owners"]);
    }),
  );

  it.effect("lists the Current repo, though no open space is in it", () =>
    Effect.gen(function* () {
      const { api } = scripts({ scan: "/w\t/w/zed\t1\n", owners: "" });
      const current = Option.some({ machine: THIS_MACHINE, root: "/tmp/tool", count: 2 });
      const found = yield* findRepos(settings, "/h", [], Option.none(), current).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        Result.map(found, (f) => f.repos),
        Result.succeed([
          { machine: THIS_MACHINE, root: "/tmp/tool", count: 2, group: "Other" },
          { machine: THIS_MACHINE, root: "/w/zed", count: 1, group: "Work" },
        ]),
      );
    }),
  );

  it.effect("a hidden Current repo is left out of the list too", () =>
    Effect.gen(function* () {
      const { api } = scripts({ scan: "", owners: "" });
      const hiding = { ...settings, hidden: [here("/tmp/tool")] };
      const current = Option.some({ machine: THIS_MACHINE, root: "/tmp/tool", count: 2 });
      const found = yield* findRepos(hiding, "/h", [], Option.none(), current).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        Result.map(found, (f) => f.repos),
        Result.succeed([]),
      );
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

describe("findRepos across machines", () => {
  /**
   * A Herdr API with a home and a folder scan answer per machine (`null`: this machine),
   * recording each run as `[machine, what, args]`.
   */
  const machines = (
    answers: ReadonlyMap<string | null, { home: string; scan: string; owners?: string }>,
  ) => {
    const ran: unknown[] = [];
    const api: ExecApi = {
      hc: noHc,
      exec: (_command, args = [], options) => {
        const on = options?.on ?? null;
        const answer = answers.get(on);
        const body = args[1] ?? "";
        const what =
          body.includes("$HOME") && !body.includes("walk()")
            ? "home"
            : body.includes("walk()")
              ? "scan"
              : "owners";
        ran.push([on, what, args.slice(3)]);
        const stdout =
          what === "home" ? answer?.home : what === "scan" ? answer?.scan : answer?.owners;
        return Promise.resolve({ code: 0, stdout: stdout ?? "", stderr: "" });
      },
    };
    return { api, ran };
  };

  it.effect("scans each machine's group folders on it, ~ as its home, the same repo twice", () =>
    Effect.gen(function* () {
      const settings = {
        ...DEFAULT_SETTINGS,
        folders: [
          { name: "Work", path: "/srv/code", machine: THIS_MACHINE },
          { name: "Box", path: "~/code", machine: "linux" },
        ],
      };
      const { api, ran } = machines(
        new Map([
          [THIS_MACHINE, { home: "/Users/me", scan: "/srv/code\t/srv/code/api\t1\n" }],
          ["linux", { home: "/srv", scan: "/srv/code\t/srv/code/api\t2\n" }],
        ]),
      );
      const found = yield* findRepos(settings, "/Users/me", [], Option.none()).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        Result.map(found, (f) => f.repos),
        Result.succeed([
          { machine: THIS_MACHINE, root: "/srv/code/api", count: 1, group: "Work" },
          { machine: "linux", root: "/srv/code/api", count: 2, group: "Box" },
        ]),
      );
      assert.deepStrictEqual(
        ran.filter((run) => Array.isArray(run) && run[1] === "scan"),
        [
          [THIS_MACHINE, "scan", ["4", "/node_modules//.cache/", "/srv/code"]],
          ["linux", "scan", ["4", "/node_modules//.cache/", "/srv/code"]],
        ],
      );
    }),
  );

  it.effect("finds each open space's repo on the space's machine", () =>
    Effect.gen(function* () {
      const { api, ran } = machines(
        new Map([
          [THIS_MACHINE, { home: "/Users/me", scan: "", owners: "/Users/me/tool\t1\n" }],
          ["linux", { home: "/srv", scan: "", owners: "/srv/api\t2\n" }],
        ]),
      );
      const places = [local("/Users/me/tool/src"), { machine: "linux", folder: "/srv/api.feat" }];
      const found = yield* findRepos(DEFAULT_SETTINGS, "/Users/me", places, Option.none()).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        Result.map(found, (f) => f.repos),
        Result.succeed([
          { machine: "linux", root: "/srv/api", count: 2, group: "Other" },
          { machine: THIS_MACHINE, root: "/Users/me/tool", count: 1, group: "Other" },
        ]),
      );
      assert.deepStrictEqual(
        ran.filter((run) => Array.isArray(run) && run[1] === "owners"),
        [
          [THIS_MACHINE, "owners", ["/Users/me/tool/src"]],
          ["linux", "owners", ["/srv/api.feat"]],
        ],
      );
    }),
  );

  it.effect("with a last scan, scans only the machines it lacks, such as one that was down", () =>
    Effect.gen(function* () {
      const settings = {
        ...DEFAULT_SETTINGS,
        folders: [
          { name: "Work", path: "/w", machine: THIS_MACHINE },
          { name: "Box", path: "~/code", machine: "linux" },
        ],
      };
      const { api, ran } = machines(
        new Map([
          [THIS_MACHINE, { home: "/h", scan: "/w\t/w/new\t1\n" }],
          ["linux", { home: "/srv", scan: "/srv/code\t/srv/code/api\t2\n" }],
        ]),
      );
      const last = searched(THIS_MACHINE, "/h", {
        repos: [{ machine: THIS_MACHINE, root: "/w/zed", count: 1 }],
        missing: [],
      });
      const found = yield* findRepos(settings, "/h", [], Option.some(last)).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        Result.map(found, (f) => [f.repos.map((repo) => repo.root), f.scanned]),
        Result.succeed([
          ["/srv/code/api", "/w/zed"],
          {
            repos: [
              { machine: THIS_MACHINE, root: "/w/zed", count: 1 },
              { machine: "linux", root: "/srv/code/api", count: 2 },
            ],
            missing: [],
            homes: new Map([
              [THIS_MACHINE, "/h"],
              ["linux", "/srv"],
            ]),
            machines: [THIS_MACHINE, "linux"],
          },
        ]),
      );
      assert.deepStrictEqual(
        ran
          .filter((run) => Array.isArray(run) && run[1] === "scan")
          .map((run) => Array.isArray(run) && run[0]),
        ["linux"],
      );
    }),
  );
});

describe("findRepos with a machine down", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    folders: [
      { name: "Work", path: "/w", machine: THIS_MACHINE },
      { name: "Box", path: "/srv", machine: "linux" },
    ],
  };

  /**
   * A Herdr API where this machine answers the scan and owners scripts and every run on
   * `linux` fails with `error`; records each run as `[machine, what]`.
   */
  const linuxDown = (error: string) => {
    const ran: unknown[] = [];
    const api: ExecApi = {
      hc: noHc,
      exec: (_command, args = [], options) => {
        const on = options?.on ?? null;
        const body = args[1] ?? "";
        const what = body.includes("walk()")
          ? "scan"
          : body.includes("git-common-dir")
            ? "owners"
            : "home";
        ran.push([on, what]);
        if (on === "linux") return Promise.resolve({ code: 255, stdout: "", stderr: error });
        const stdout = what === "scan" ? "/w\t/w/zed\t1\n" : what === "owners" ? "" : "/h";
        return Promise.resolve({ code: 0, stdout, stderr: "" });
      },
    };
    return { api, ran };
  };

  it.effect("this machine's repos are still found, and the machine is down with the error", () =>
    Effect.gen(function* () {
      const { api } = linuxDown("ssh: connect to host linux: timed out\n");
      const found = yield* findRepos(settings, "/h", [], Option.none()).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual<unknown>(
        Result.map(found, (f) => [f.repos, f.statuses]),
        Result.succeed([
          [{ machine: THIS_MACHINE, root: "/w/zed", count: 1, group: "Work" }],
          new Map([["linux", { _tag: "Down", reason: "ssh: connect to host linux: timed out" }]]),
        ]),
      );
    }),
  );

  it.effect(
    "a machine still connecting runs nothing and is connecting; this machine is searched",
    () =>
      Effect.gen(function* () {
        const { api, ran } = linuxDown("never reached");
        const states = machineStates([{ name: "linux", layout: "loading" }]);
        const found = yield* findRepos(
          settings,
          "/h",
          [{ machine: "linux", folder: "/srv/api" }],
          Option.none(),
          Option.none(),
          states,
        ).pipe(Effect.provide(Shell.layer(api)));
        assert.deepStrictEqual<unknown>(
          Result.map(found, (f) => [f.repos.map((repo) => repo.root), f.statuses]),
          Result.succeed([["/w/zed"], new Map([["linux", { _tag: "Connecting" }]])]),
        );
        assert.deepStrictEqual(
          ran.filter((run) => Array.isArray(run) && run[0] === "linux"),
          [],
        );
      }),
  );
});

describe("refreshMachines", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    folders: [
      { name: "Work", path: "/w", machine: THIS_MACHINE },
      { name: "Box", path: "/srv", machine: "linux" },
    ],
  };

  const ask = (busy: ReadonlySet<string | null> = new Set()) => ({
    settings,
    home: "/h",
    places: [],
    last: new Map(),
    rescan: true,
    states: new Map(),
    busy,
  });

  /**
   * A Herdr API where `linux` never answers and this machine answers the scan with
   * `/w/zed`, the owners lookup with nothing, and the batched list with empty lists;
   * records each run as `[machine, what]`.
   */
  const linuxHangs = () => {
    const ran: (readonly [string | null, string])[] = [];
    const api: ExecApi = {
      hc: noHc,
      exec: (_command, args = [], options) => {
        const on = options?.on ?? null;
        const body = args[1] ?? "";
        const what = body.includes("walk()")
          ? "scan"
          : body.includes("git-common-dir")
            ? "owners"
            : body.includes("wt list")
              ? "lists"
              : "home";
        ran.push([on, what]);
        if (on === "linux") return new Promise(() => undefined);
        const stdout =
          what === "scan"
            ? "/w\t/w/zed\t1\n"
            : what === "lists"
              ? args
                  .slice(3)
                  .map((root) => `\u001e0\t${root}\n[]`)
                  .join("")
              : "";
        return Promise.resolve({ code: 0, stdout, stderr: "" });
      },
    };
    return { api, ran };
  };

  it.live("this machine's repos and lists land while another machine's search hangs", () =>
    Effect.gen(function* () {
      const { api } = linuxHangs();
      const landed: { resolve: (answer: unknown) => void } = { resolve: () => undefined };
      const landing = new Promise<unknown>((resolve) => {
        landed.resolve = resolve;
      });
      const searched: unknown[] = [];
      const fiber = yield* refreshMachines(
        ask(),
        (machine, search) => {
          searched.push([machine, Result.map(search, (found) => found.scan.repos)]);
          return machine === THIS_MACHINE ? [here("/w/zed")] : [];
        },
        (machine, answer) => {
          if (machine === THIS_MACHINE) landed.resolve(answer);
        },
      ).pipe(Effect.provide(Shell.layer(api)), Effect.forkChild);
      const first = yield* Effect.race(
        Effect.promise(() => landing),
        Effect.sleep("200 millis").pipe(Effect.as("waited on linux")),
      );
      yield* Fiber.interrupt(fiber);
      assert.deepStrictEqual(first, Result.succeed(new Map([["/w/zed", Result.succeed([])]])));
      assert.deepStrictEqual(searched, [
        [THIS_MACHINE, Result.succeed([{ machine: THIS_MACHINE, root: "/w/zed", count: 1 }])],
      ]);
    }),
  );
});

describe("refreshMachines with a machine busy", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    folders: [
      { name: "Work", path: "/w", machine: THIS_MACHINE },
      { name: "Box", path: "/srv", machine: "linux" },
    ],
  };

  /** A Herdr API where every machine answers every script with nothing; records each run's machine. */
  const quiet = () => {
    const ran: (string | null)[] = [];
    const api: ExecApi = {
      hc: noHc,
      exec: (_command, _args, options) => {
        ran.push(options?.on ?? null);
        return Promise.resolve({ code: 0, stdout: "", stderr: "" });
      },
    };
    return { api, ran };
  };

  it.effect("a machine still busy with an earlier refresh runs nothing and isn't handed on", () =>
    Effect.gen(function* () {
      const { api, ran } = quiet();
      const searched: unknown[] = [];
      yield* refreshMachines(
        {
          settings,
          home: "/h",
          places: [],
          last: new Map(),
          rescan: true,
          states: new Map(),
          busy: new Set(["linux"]),
        },
        (machine) => {
          searched.push(machine);
          return [];
        },
        () => undefined,
      ).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        [searched, ran.filter((machine) => machine === "linux")],
        [[THIS_MACHINE], []],
      );
    }),
  );

  it.effect("each machine's refresh ends with onDone, one whose search failed too", () =>
    Effect.gen(function* () {
      const api: ExecApi = {
        hc: noHc,
        exec: (_command, _args, options) =>
          Promise.resolve(
            options?.on === "linux"
              ? { code: 255, stdout: "", stderr: "ssh: timed out" }
              : { code: 0, stdout: "", stderr: "" },
          ),
      };
      const done: unknown[] = [];
      yield* refreshMachines(
        {
          settings,
          home: "/h",
          places: [],
          last: new Map(),
          rescan: true,
          states: new Map(),
          busy: new Set(),
        },
        () => [],
        () => undefined,
        (machine) => done.push(machine),
      ).pipe(Effect.provide(Shell.layer(api)));
      assert.sameMembers(done, [THIS_MACHINE, "linux"]);
    }),
  );
});

describe("scanKey", () => {
  const work = { ...DEFAULT_SETTINGS, folders: [{ name: "Work", path: "/w", machine: null }] };

  it("a change to the folders, the depth or the skip names changes the key", () => {
    const keys = [
      work,
      { ...work, folders: [] },
      { ...work, depth: 7 },
      { ...work, skip: ["dist"] },
    ].map(scanKey);
    assert.strictEqual(new Set(keys).size, 4);
  });

  it("hiding a repo or the no-wrapper setting leaves the key alone: they change no scan", () => {
    const keys = [
      work,
      { ...work, hidden: [{ machine: null, root: "/w/old" }] },
      { ...work, noWrapper: true },
    ].map(scanKey);
    assert.strictEqual(new Set(keys).size, 1);
  });
});

describe("landSearch", () => {
  const found = (root: string): MachineSearch =>
    Result.succeed({
      machine: THIS_MACHINE,
      home: Option.some("/h"),
      scan: { repos: [{ machine: THIS_MACHINE, root, count: 1 }], missing: [] },
      owners: [],
    });
  const start: Landed = {
    searches: new Map([[THIS_MACHINE, found("/w/old")]]),
    error: Option.none(),
    statuses: new Map(),
  };

  it("this machine's failure is the error, and its last search that worked stays", () => {
    const landed = landSearch(start, THIS_MACHINE, Result.fail({ _tag: "Down", reason: "no sh" }));
    assert.deepStrictEqual(landed, { ...start, error: Option.some("no sh") });
  });

  it("this machine's search that works clears its status from a failed list read", () => {
    const listFailed: Landed = {
      ...start,
      statuses: new Map([[THIS_MACHINE, { _tag: "Down", reason: "wt: not found" }]]),
    };
    assert.deepStrictEqual(
      landSearch(listFailed, THIS_MACHINE, found("/w/new")).statuses,
      new Map(),
    );
  });

  it("another machine's failure is its status, and a search that works clears it", () => {
    const down = landSearch(start, "linux", Result.fail({ _tag: "Down", reason: "timed out" }));
    const back = landSearch(down, "linux", found("/srv/a"));
    assert.deepStrictEqual(
      [down.statuses, back.statuses],
      [new Map([["linux", { _tag: "Down", reason: "timed out" }]]), new Map()],
    );
  });
});

describe("lookUpCurrent", () => {
  it.effect("the repo the focused folder is in", () =>
    Effect.gen(function* () {
      const { api } = scripts({ owners: "/r/api\t2\n" });
      const found = yield* lookUpCurrent({ machine: THIS_MACHINE, folder: "/r/api.feat" }).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        found,
        Result.succeed(Option.some({ machine: THIS_MACHINE, root: "/r/api", count: 2 })),
      );
    }),
  );

  it.effect("a folder on another machine is in a repo on that machine", () =>
    Effect.gen(function* () {
      const { api } = scripts({ owners: "/srv/api\t2\n" });
      const found = yield* lookUpCurrent({ machine: "linux", folder: "/srv/api.feat" }).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        found,
        Result.succeed(Option.some({ machine: "linux", root: "/srv/api", count: 2 })),
      );
    }),
  );

  it.effect("a lookup that fails is its one-line reason", () =>
    Effect.gen(function* () {
      const { api } = scripts({});
      const found = yield* lookUpCurrent({ machine: THIS_MACHINE, folder: "/r/api" }).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(found, Result.fail("no owners"));
    }),
  );
});

/**
 * A Herdr API whose `exec` answers the dialog's lookups by a word in each script (absent
 * answers fail), recording which ran and with what.
 */
const lookups = (answers: {
  readonly owners?: string;
  readonly branch?: string;
  readonly branches?: string;
  readonly list?: string;
}) => {
  const ran: (readonly string[])[] = [];
  /** The machine each lookup ran on, in order: null for this one. */
  const on: (string | null)[] = [];
  const which = (body: string) =>
    body.includes("git-common-dir")
      ? "owners"
      : body.includes("--show-current")
        ? "branch"
        : body.includes("for-each-ref")
          ? "branches"
          : body.includes("wt list")
            ? "list"
            : "?";
  const api: ExecApi = {
    hc: noHc,
    exec: (_command, args = [], options) => {
      const name = which(args[1] ?? "");
      ran.push([name, ...args.slice(3)]);
      on.push(options?.on ?? null);
      const stdout = name === "?" ? undefined : answers[name];
      return Promise.resolve(
        stdout === undefined
          ? { code: 1, stdout: "", stderr: `no ${name}` }
          : { code: 0, stdout, stderr: "" },
      );
    },
  };
  return { api, ran, on };
};

describe("dialogFor", () => {
  it.effect("the focused folder's repo, the branch it is on, and the repos by folder name", () =>
    Effect.gen(function* () {
      const { api, ran } = lookups({ owners: "/r/api\t2\n", branch: "feat/a\n" });
      const opened = yield* dialogFor(
        { machine: THIS_MACHINE, folder: "/r/api.feat" },
        ["/w/web", "/r/api", "/p/app"].map(here),
      ).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        opened,
        Result.succeed(
          Option.some({
            mode: "new",
            repo: Option.some(here("/r/api")),
            branch: Option.some("feat/a"),
            repos: ["/r/api", "/p/app", "/w/web"].map(here),
          }),
        ),
      );
      assert.deepStrictEqual(ran, [
        ["owners", "/r/api.feat"],
        ["branch", "/r/api.feat"],
      ]);
    }),
  );

  it.effect("a folder on another machine: its repo and branch are looked up there", () =>
    Effect.gen(function* () {
      const { api, on } = lookups({ owners: "/srv/api\t2\n", branch: "fix/b\n" });
      const opened = yield* dialogFor({ machine: "linux", folder: "/srv/api.fix" }, []).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        [opened, on],
        [
          Result.succeed(
            Option.some({
              mode: "new",
              repo: Option.some({ machine: "linux", root: "/srv/api" }),
              branch: Option.some("fix/b"),
              repos: [],
            }),
          ),
          ["linux", "linux"],
        ],
      );
    }),
  );

  it.effect("outside every repo: no repo, no branch looked up, and the repos to pick from", () =>
    Effect.gen(function* () {
      const { api, ran } = lookups({ owners: "" });
      const opened = yield* dialogFor({ machine: THIS_MACHINE, folder: "/tmp" }, [
        here("/r/web"),
      ]).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        [opened, ran],
        [
          Result.succeed(
            Option.some({
              mode: "new",
              repo: Option.none(),
              branch: Option.none(),
              repos: [here("/r/web")],
            }),
          ),
          [["owners", "/tmp"]],
        ],
      );
    }),
  );

  it.effect("no repo there and none listed: no dialog", () =>
    Effect.gen(function* () {
      const { api } = lookups({ owners: "" });
      const opened = yield* dialogFor({ machine: THIS_MACHINE, folder: "/tmp" }, []).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(opened, Result.succeed(Option.none()));
    }),
  );

  it.effect("no focused folder: looks nothing up, and asks for a repo", () =>
    Effect.gen(function* () {
      const { api, ran } = lookups({});
      const opened = yield* dialogFor({ machine: THIS_MACHINE, folder: "" }, [here("/r/web")]).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        [opened, ran],
        [
          Result.succeed(
            Option.some({
              mode: "new",
              repo: Option.none(),
              branch: Option.none(),
              repos: [here("/r/web")],
            }),
          ),
          [],
        ],
      );
    }),
  );

  it.effect("a repo lookup that fails is its one-line reason, not a guess", () =>
    Effect.gen(function* () {
      const { api } = lookups({});
      const opened = yield* dialogFor({ machine: THIS_MACHINE, folder: "/r/api" }, [
        here("/r/web"),
      ]).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(opened, Result.fail("no owners"));
    }),
  );

  it.effect("a branch lookup that fails is its one-line reason", () =>
    Effect.gen(function* () {
      const { api } = lookups({ owners: "/r/api\t2\n" });
      const opened = yield* dialogFor({ machine: THIS_MACHINE, folder: "/r/api" }, []).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(opened, Result.fail("no branch"));
    }),
  );
});

describe("readDialogRepo", () => {
  it.effect("the repo's worktrees, from wt list, and its branches", () =>
    Effect.gen(function* () {
      const { api, ran } = lookups({ list: states, branches: "refs/heads/main\n" });
      const read = yield* readDialogRepo(here("/r/app")).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(read, {
        list: parseList(states),
        branches: Result.succeed([{ name: "main", remote: false }]),
      });
      // Both reads run at once, so either may start first.
      const calls = ran.map((call) => call.join(" ")).sort((a, b) => a.localeCompare(b));
      assert.deepStrictEqual(calls, ["branches /r/app", "list /r/app"]);
    }),
  );

  it.effect("each read that fails is its one-line reason, and the other still lands", () =>
    Effect.gen(function* () {
      const { api } = lookups({ list: states });
      const read = yield* readDialogRepo(here("/r/app")).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(read, {
        list: parseList(states),
        branches: Result.fail("no branches"),
      });
    }),
  );
});

describe("spaceWorktree", () => {
  it.effect("merges the worktree a space's folder is in, from its repo's list read now", () =>
    Effect.gen(function* () {
      const { api, ran } = lookups({ owners: "/work/repo\t15\n", list: states });
      const asked = yield* spaceWorktree("Merge", {
        machine: THIS_MACHINE,
        folder: "/work/repo.ahead/src",
      }).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        [asked, ran.map(([name]) => name)],
        [
          Result.succeed({
            _tag: "Merge",
            target: {
              machine: THIS_MACHINE,
              main: "/work/repo",
              path: "/work/repo.ahead",
              branch: "ahead",
            },
            mode: "squash",
            dirty: false,
          }),
          ["owners", "list"],
        ],
      );
    }),
  );

  it.effect(
    "a space on another machine: its repo and list are read there, and acted on there",
    () =>
      Effect.gen(function* () {
        const { api, on } = lookups({ owners: "/work/repo\t15\n", list: states });
        const asked = yield* spaceWorktree("Remove", {
          machine: "linux",
          folder: "/work/repo.ahead",
        }).pipe(Effect.provide(Shell.layer(api)));
        assert.deepStrictEqual(
          [asked, on],
          [
            Result.succeed({
              _tag: "Remove",
              target: {
                machine: "linux",
                main: "/work/repo",
                path: "/work/repo.ahead",
                branch: "ahead",
              },
              dirty: false,
            }),
            ["linux", "linux"],
          ],
        );
      }),
  );

  it.effect("a folder outside every repo says so, and reads no list", () =>
    Effect.gen(function* () {
      const { api, ran } = lookups({ owners: "", list: states });
      const asked = yield* spaceWorktree("Remove", {
        machine: THIS_MACHINE,
        folder: "/tmp/notes",
      }).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        [asked, ran.map(([name]) => name)],
        [Result.fail("/tmp/notes isn't in a git repo."), ["owners"]],
      );
    }),
  );

  it.effect("a repo lookup that fails is its one-line reason", () =>
    Effect.gen(function* () {
      const { api } = lookups({ list: states });
      const asked = yield* spaceWorktree("Merge", {
        machine: THIS_MACHINE,
        folder: "/work/repo.ahead",
      }).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(asked, Result.fail("no owners"));
    }),
  );

  it.effect("a list that can't be read is its one-line reason", () =>
    Effect.gen(function* () {
      const { api } = lookups({ owners: "/work/repo\t15\n" });
      const asked = yield* spaceWorktree("Merge", {
        machine: THIS_MACHINE,
        folder: "/work/repo.ahead",
      }).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(asked, Result.fail("no list"));
    }),
  );

  it.effect("the main checkout's space is refused with the reason", () =>
    Effect.gen(function* () {
      const { api } = lookups({ owners: "/work/repo\t15\n", list: states });
      const asked = yield* spaceWorktree("Remove", {
        machine: THIS_MACHINE,
        folder: "/work/repo",
      }).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        asked,
        Result.fail("repo's main checkout can't be merged or removed."),
      );
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
      const list = yield* readList(here("/work/repo")).pipe(Effect.provide(Shell.layer(api)));
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
      const list = yield* readList(here("/gone")).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(list, Result.fail("fatal: not a git repository"));
    }),
  );
});

describe("readLists", () => {
  /**
   * A Herdr API whose batched list answers every repo it is given with an empty list,
   * except on the machines in `failing`, whose run fails with that error; records each run
   * as `[machine, folders]`.
   */
  const batches = (failing: ReadonlyMap<string | null, string> = new Map()) => {
    const ran: (readonly [string | null, readonly string[]])[] = [];
    const api: ExecApi = {
      hc: noHc,
      exec: (_command, args = [], options) => {
        const on = options?.on ?? null;
        const roots = args.slice(3);
        ran.push([on, roots]);
        const error = failing.get(on);
        return error === undefined
          ? Promise.resolve({
              code: 0,
              stdout: roots.map((root) => `\u001e0\t${root}\n[]`).join(""),
              stderr: "",
            })
          : Promise.resolve({ code: 255, stdout: "", stderr: error });
      },
    };
    return { api, ran };
  };

  it.effect("one batched wt list per machine, each machine's lists kept by repo", () =>
    Effect.gen(function* () {
      const { api, ran } = batches();
      const kept: unknown[] = [];
      yield* readLists(
        [here("/a"), { machine: "linux", root: "/srv/c" }, here("/b")],
        new Map(),
        (machine, answer) => kept.push([machine, answer]),
      ).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(ran, [
        [THIS_MACHINE, ["/a", "/b"]],
        ["linux", ["/srv/c"]],
      ]);
      assert.deepStrictEqual(kept, [
        [
          THIS_MACHINE,
          Result.succeed(
            new Map([
              ["/a", Result.succeed([])],
              ["/b", Result.succeed([])],
            ]),
          ),
        ],
        ["linux", Result.succeed(new Map([["linux:/srv/c", Result.succeed([])]]))],
      ]);
    }),
  );

  it.effect("a machine still connecting runs nothing and is kept as connecting", () =>
    Effect.gen(function* () {
      const { api, ran } = batches();
      const kept: unknown[] = [];
      yield* readLists(
        [here("/a"), { machine: "linux", root: "/srv/c" }],
        new Map([["linux", { _tag: "Connecting" } as const]]),
        (machine, answer) => kept.push([machine, answer]),
      ).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(ran, [[THIS_MACHINE, ["/a"]]]);
      assert.deepStrictEqual(kept, [
        ["linux", Result.fail({ _tag: "Connecting" })],
        [THIS_MACHINE, Result.succeed(new Map([["/a", Result.succeed([])]]))],
      ]);
    }),
  );

  it.effect(
    "a machine whose batched run fails is down with the error; this machine's lists still land",
    () =>
      Effect.gen(function* () {
        const { api } = batches(new Map([["linux", "ssh: connect to host linux: timed out\n"]]));
        const kept: unknown[] = [];
        yield* readLists(
          [here("/a"), { machine: "linux", root: "/srv/c" }],
          new Map(),
          (machine, answer) => kept.push([machine, answer]),
        ).pipe(Effect.provide(Shell.layer(api)));
        assert.deepStrictEqual(kept, [
          [THIS_MACHINE, Result.succeed(new Map([["/a", Result.succeed([])]]))],
          ["linux", Result.fail({ _tag: "Down", reason: "ssh: connect to host linux: timed out" })],
        ]);
      }),
  );

  it.effect("a machine whose read dies, a bug, is kept as down with the defect", () =>
    Effect.gen(function* () {
      const api: ExecApi = {
        hc: noHc,
        exec: (_command, args = [], options) =>
          options?.on === "linux"
            ? // An answer with no fields: reading its exit code throws, a defect.
              Promise.resolve(undefined as unknown as Awaited<ReturnType<ExecApi["exec"]>>)
            : Promise.resolve({ code: 0, stdout: `\u001e0\t${args[3]}\n[]`, stderr: "" }),
      };
      const kept: (readonly [unknown, MachineLists])[] = [];
      yield* readLists(
        [here("/a"), { machine: "linux", root: "/srv/c" }],
        new Map(),
        (machine, answer) => kept.push([machine, answer]),
      ).pipe(Effect.provide(Shell.layer(api)), Effect.exit);
      const linux = kept.find(([machine]) => machine === "linux");
      assert.deepStrictEqual(
        Option.map(Option.fromNullishOr(linux), ([, answer]) =>
          Result.match(answer, {
            onSuccess: () => "read",
            onFailure: (status) =>
              status._tag === "Down" && status.reason.includes("TypeError") ? "down" : "other",
          }),
        ),
        Option.some("down"),
      );
    }),
  );

  it.live("this machine's lists land while another machine's run hangs", () =>
    Effect.gen(function* () {
      const landed = { resolve: (): void => undefined };
      const landing = new Promise<string>((resolve) => {
        landed.resolve = () => resolve("landed");
      });
      const api: ExecApi = {
        hc: noHc,
        exec: (_command, args = [], options) =>
          options?.on === "linux"
            ? new Promise(() => undefined)
            : Promise.resolve({ code: 0, stdout: `\u001e0\t${args[3]}\n[]`, stderr: "" }),
      };
      const fiber = yield* readLists(
        [{ machine: "linux", root: "/srv/c" }, here("/a")],
        new Map(),
        (machine) => {
          if (machine === THIS_MACHINE) landed.resolve();
        },
      ).pipe(Effect.provide(Shell.layer(api)), Effect.forkChild);
      const first = yield* Effect.race(
        Effect.promise(() => landing),
        Effect.sleep("200 millis").pipe(Effect.as("waited on linux")),
      );
      yield* Fiber.interrupt(fiber);
      assert.strictEqual(first, "landed");
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
      const read = yield* readCi(here("/work/repo")).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(read, parseList(ci));
    }),
  );
});

describe("defectAsReason", () => {
  it.effect("a read that dies, a bug, is its failed answer naming the defect", () =>
    Effect.gen(function* () {
      const answer = yield* defectAsReason(
        Effect.die(new TypeError("no list")).pipe(
          Effect.as<Result.Result<readonly string[], string>>(Result.succeed([])),
        ),
      ).pipe(Effect.exit);
      assert.deepStrictEqual(answer, Exit.succeed(Result.fail("a bug: TypeError: no list")));
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
        Result.map(
          toast,
          Option.map((notice) => notice.title),
        ),
        Result.succeed(Option.some("Herdr updated: run herdr:sync")),
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
      assert.deepStrictEqual(toast, Result.succeed(Option.none()));
    }),
  );

  it.effect("a record that can't be read is its one-line reason, not a silent no toast", () =>
    Effect.gen(function* () {
      const api: FilesApi = { ...disk({}).api, readTextFile: () => Promise.reject("denied") };
      const toast = yield* syncToast(RECORD, "0.1.14", undefined).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual(
        toast,
        Result.fail("iangregsondev-sync.json: couldn't read it (denied)"),
      );
    }),
  );
});

describe("hideInSettings", () => {
  it.effect("adds the repo to the hidden list, over the file as it was read", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.path]: WORK });
      const hid = yield* hideInSettings(FILES, here("/w/api")).pipe(
        Effect.provide(Files.layer(api)),
      );
      const hidden = serializeSettings({
        ...DEFAULT_SETTINGS,
        folders: [{ name: "Work", path: "~/w", machine: THIS_MACHINE }],
        depth: 2,
        skip: [],
        hidden: [here("/w/api")],
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
      const hid = yield* hideInSettings(FILES, here("/w/api")).pipe(
        Effect.provide(Files.layer(api)),
      );
      const made = serializeSettings({ ...DEFAULT_SETTINGS, hidden: [here("/w/api")] });
      assert.deepStrictEqual(
        [hid, writes],
        [Result.succeed(undefined), [[FILES.path, made, null]]],
      );
    }),
  );

  it.effect("a repo already hidden writes nothing", () =>
    Effect.gen(function* () {
      const file = serializeSettings({ ...DEFAULT_SETTINGS, hidden: [here("/w/api")] });
      const { api, writes } = disk({ [FILES.path]: file });
      const hid = yield* hideInSettings(FILES, here("/w/api")).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual([hid, writes], [Result.succeed(undefined), []]);
    }),
  );

  it.effect("a file that doesn't parse is left alone, and the answer says why", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.path]: '{"depth": "4"}' });
      const hid = yield* hideInSettings(FILES, here("/w/api")).pipe(
        Effect.provide(Files.layer(api)),
      );
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
        pickFolder: noPicker,
        exec: noExec,
      };
      const hid = yield* hideInSettings(FILES, here("/w/api")).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual(
        hid,
        Result.fail("iangregsondev-worktrunk.json changed while hiding the repo: try again."),
      );
    }),
  );

  it.effect("a file that can't be written: the answer says it couldn't be saved, and why", () =>
    Effect.gen(function* () {
      const api: FilesApi = {
        readTextFile: () => Promise.resolve(WORK),
        writeTextFile: () => Promise.reject(new Error("disk full")),
        pickFolder: noPicker,
        exec: noExec,
      };
      const hid = yield* hideInSettings(FILES, here("/w/api")).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual(
        hid,
        Result.fail("iangregsondev-worktrunk.json: couldn't save it (disk full)"),
      );
    }),
  );

  it.effect("a file that can't be read is left alone: the answer says it couldn't be read", () =>
    Effect.gen(function* () {
      const writes: unknown[] = [];
      const api: FilesApi = {
        readTextFile: () => Promise.reject(new Error("no access")),
        writeTextFile: (path) => {
          writes.push(path);
          return Promise.resolve(null);
        },
        pickFolder: noPicker,
        exec: noExec,
      };
      const hid = yield* hideInSettings(FILES, here("/w/api")).pipe(
        Effect.provide(Files.layer(api)),
      );
      assert.deepStrictEqual(
        [hid, writes],
        [Result.fail("iangregsondev-worktrunk.json: couldn't read it (no access)"), []],
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
  on: THIS_MACHINE,
};

/** MERGE_JOB for a repo on the machine `linux`. */
const LINUX_JOB = { ...MERGE_JOB, cwd: "/srv/app", gone: ["/srv/app.feat"], on: "linux" };

/** The jobs API for `options`, also recording each exec's command and the machine it ran on. */
const machineJobApi = (options: Parameters<typeof jobApi>[0]) => {
  const jobs = jobApi(options);
  const ran: unknown[] = [];
  const hcRuns: (readonly string[])[] = [];
  const api: ExecApi = {
    exec: (command, args = [], execOptions) => {
      ran.push([command, execOptions?.on ?? THIS_MACHINE]);
      return jobs.api.exec(command, args);
    },
    hc: (args) => {
      if (args[0] === "run") hcRuns.push(args);
      return jobs.api.hc(args);
    },
  };
  return { api, ran, hcRuns, log: jobs.log };
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
          problems: [],
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

  it.effect("a job on another machine reads that machine's login shell and starts there", () =>
    Effect.gen(function* () {
      const { api, ran, hcRuns } = machineJobApi({ gone: "/srv/app.feat\n" });
      yield* runJob(LINUX_JOB, () => undefined).pipe(Effect.provide(Shell.layer(api)));
      assert.deepStrictEqual(
        [ran[0], hcRuns.map((args) => args.slice(4, 8))],
        [["sh", "linux"], [["--on", "linux", "--cwd", "/srv/app"]]],
      );
    }),
  );

  it.effect("a job on another machine checks its removed folders there", () =>
    Effect.gen(function* () {
      const { api, ran, log } = machineJobApi({ gone: "/srv/app.feat\n" });
      const outcome = yield* runJob(LINUX_JOB, () => undefined).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        [log.at(-1), ran.at(-1), outcome._tag === "Ended" ? outcome.gone : []],
        [["gone", "/srv/app.feat"], ["sh", "linux"], ["/srv/app.feat"]],
      );
    }),
  );

  it.effect("what fails around a job on another machine is named as that machine's", () =>
    Effect.gen(function* () {
      const { api } = machineJobApi({ goneFails: true });
      const outcome = yield* runJob(LINUX_JOB, () => undefined).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(outcome, {
        _tag: "Ended",
        code: Option.some(0),
        gone: [],
        problems: ["On linux: Couldn't check which folders went, so no space was closed: no"],
      });
    }),
  );

  it.effect("a job on another machine that never started says so as that machine's", () =>
    Effect.gen(function* () {
      const { api } = machineJobApi({ started: "oops" });
      const outcome = yield* runJob(LINUX_JOB, () => undefined).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(outcome, { _tag: "NotStarted", reason: "On linux: no such folder" });
    }),
  );

  it.effect("a login shell that can't be found: the job never starts, and says why", () =>
    Effect.gen(function* () {
      const { api, log } = jobApi({});
      const noShell: ExecApi = {
        ...api,
        exec: (command, args) =>
          command === "sh" && args?.[1] === 'printf %s "$SHELL"'
            ? Promise.reject("no sh")
            : api.exec(command, args),
      };
      const outcome = yield* runJob(MERGE_JOB, () => undefined).pipe(
        Effect.provide(Shell.layer(noShell)),
      );
      assert.deepStrictEqual(
        [outcome, log],
        [
          {
            _tag: "NotStarted",
            reason: "couldn't find your login shell: couldn't read $SHELL: couldn't start: no sh",
          },
          [],
        ],
      );
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

  it.effect("a removed folders' check that fails closes nothing and says so; the job ended", () =>
    Effect.gen(function* () {
      const { api } = jobApi({ goneFails: true });
      const outcome = yield* runJob(MERGE_JOB, () => undefined).pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(outcome, {
        _tag: "Ended",
        code: Option.some(0),
        gone: [],
        problems: ["Couldn't check which folders went, so no space was closed: no"],
      });
    }),
  );

  it.effect("a terminal that can't be removed is reported, and the job still ended", () =>
    Effect.gen(function* () {
      const { api } = jobApi({ gone: "/r/app.feat\n" });
      const failingRm: ExecApi = {
        ...api,
        hc: (args) => (args[0] === "rm" ? Promise.reject("hc crashed") : api.hc(args)),
      };
      const outcome = yield* runJob(MERGE_JOB, () => undefined).pipe(
        Effect.provide(Shell.layer(failingRm)),
      );
      assert.deepStrictEqual(outcome, {
        _tag: "Ended",
        code: Option.some(0),
        gone: ["/r/app.feat"],
        problems: ["Couldn't remove the job's terminal: couldn't start: hc crashed"],
      });
    }),
  );

  it.effect(
    "hc failing while it waits loses the job, and says so: no code, and its folders are checked",
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
          problems: ["Lost track of the job: couldn't start: hc crashed"],
        });
        assert.deepStrictEqual(log.at(-2), ["hc", "rm"]);
      }),
  );
});

describe("newWorktree", () => {
  const TARGET = { main: "/r/app", name: "feat", base: null, machine: THIS_MACHINE };

  /** The job API, plus mktemp and rm in `exec`, and wt's answer file on a fake disk. */
  const newApi = (
    options: {
      readonly code?: number;
      readonly mktemp?: string;
      /** wt's answer file; none leaves it missing. */
      readonly answer?: Option.Option<string>;
      readonly rmFails?: boolean;
    } = {},
  ) => {
    const jobs = jobApi({ waits: [`{"ended":true,"exit_code":${options.code ?? 0}}`] });
    const bodies: string[] = [];
    /** The machine each exec ran on, by its command. */
    const machines: (readonly [string, unknown])[] = [];
    const exec: ExecApi["exec"] = (command, args = [], execOptions) => {
      machines.push([command, execOptions?.on ?? THIS_MACHINE]);
      if (command === "mktemp") {
        jobs.log.push(["mktemp"]);
        return Promise.resolve({ code: 0, stdout: options.mktemp ?? "/tmp/t1\n", stderr: "" });
      }
      if (command === "rm") {
        jobs.log.push(["rm", ...args]);
        return options.rmFails === true
          ? Promise.resolve({ code: 1, stdout: "", stderr: "rm: busy" })
          : Promise.resolve({ code: 0, stdout: "", stderr: "" });
      }
      return jobs.api.exec(command, args);
    };
    const hc: ExecApi["hc"] = (args) => {
      if (args[0] === "run") bodies.push(args.at(-1) ?? "");
      return jobs.api.hc(args);
    };
    const answer = options.answer ?? Option.some('{"branch":"feat","path":"/r/app.feat"}');
    const files = disk(
      Option.match(answer, {
        onNone: () => ({}),
        onSome: (text) => ({ "/tmp/t1/switch.json": text }),
      }),
    );
    /** Each answer file read, with the machine it was read on. */
    const reads: unknown[] = [];
    const layer = Layer.mergeAll(
      Shell.layer({ exec, hc }),
      Files.layer({
        ...files.api,
        readTextFile: (path, readOptions) => {
          reads.push([path, readOptions?.on ?? THIS_MACHINE]);
          return files.api.readTextFile(path, readOptions);
        },
      }),
    );
    return { layer, log: jobs.log, bodies, machines, reads };
  };

  it.effect("a repo on another machine makes and removes its temp folder there", () =>
    Effect.gen(function* () {
      const { layer, machines } = newApi();
      yield* newWorktree({ ...TARGET, machine: "linux" }, () => undefined).pipe(
        Effect.provide(layer),
      );
      assert.deepStrictEqual(
        machines.filter(([command]) => command === "mktemp" || command === "rm"),
        [
          ["mktemp", "linux"],
          ["rm", "linux"],
        ],
      );
    }),
  );

  it.effect("what fails around a new worktree on another machine is named as that machine's", () =>
    Effect.gen(function* () {
      const failing = newApi({ rmFails: true });
      const made = yield* newWorktree({ ...TARGET, machine: "linux" }, () => undefined).pipe(
        Effect.provide(failing.layer),
      );
      const noTemp = newApi({ mktemp: "" });
      const unmade = yield* newWorktree({ ...TARGET, machine: "linux" }, () => undefined).pipe(
        Effect.provide(noTemp.layer),
      );
      assert.deepStrictEqual(
        [made.problems, unmade.outcome],
        [
          ["On linux: Couldn't remove the temp folder /tmp/t1: rm: busy"],
          {
            _tag: "NotStarted",
            reason: "On linux: couldn't make a temp folder: mktemp printed no folder",
          },
        ],
      );
    }),
  );

  it.effect("a repo on another machine has wt's answer read there", () =>
    Effect.gen(function* () {
      const { layer, reads } = newApi();
      const made = yield* newWorktree({ ...TARGET, machine: "linux" }, () => undefined).pipe(
        Effect.provide(layer),
      );
      assert.deepStrictEqual(
        [reads, made.switched],
        [[["/tmp/t1/switch.json", "linux"]], Option.some({ branch: "feat", path: "/r/app.feat" })],
      );
    }),
  );

  it.effect("runs wt switch as a job, reads its answer, then removes the temp folder", () =>
    Effect.gen(function* () {
      const { layer, log, bodies } = newApi();
      const made = yield* newWorktree(TARGET, () => undefined).pipe(Effect.provide(layer));
      assert.deepStrictEqual(made, {
        outcome: { _tag: "Ended", code: Option.some(0), gone: [], problems: [] },
        switched: Option.some({ branch: "feat", path: "/r/app.feat" }),
        problems: [],
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
        outcome: { _tag: "Ended", code: Option.some(1), gone: [], problems: [] },
        switched: Option.none(),
        problems: [],
      });
      assert.deepStrictEqual(log.at(-1), ["rm", "-rf", "/tmp/t1"]);
    }),
  );

  it.effect("an answer that can't be read is reported, and opens no space", () =>
    Effect.gen(function* () {
      const { layer, log } = newApi({ answer: Option.none() });
      const made = yield* newWorktree(TARGET, () => undefined).pipe(Effect.provide(layer));
      assert.deepStrictEqual(made, {
        outcome: { _tag: "Ended", code: Option.some(0), gone: [], problems: [] },
        switched: Option.none(),
        problems: [
          "Couldn't read wt's answer, so no space was opened: /tmp/t1/switch.json is missing",
        ],
      });
      assert.deepStrictEqual(log.at(-1), ["rm", "-rf", "/tmp/t1"]);
    }),
  );

  it.effect("an answer that isn't wt's switch JSON is reported, and opens no space", () =>
    Effect.gen(function* () {
      const { layer } = newApi({ answer: Option.some("not json") });
      const made = yield* newWorktree(TARGET, () => undefined).pipe(Effect.provide(layer));
      assert.deepStrictEqual(made, {
        outcome: { _tag: "Ended", code: Option.some(0), gone: [], problems: [] },
        switched: Option.none(),
        problems: ["wt's answer names no branch and folder, so no space was opened: not json"],
      });
    }),
  );

  it.effect("a temp folder that can't be removed is reported; the worktree still opens", () =>
    Effect.gen(function* () {
      const { layer } = newApi({ rmFails: true });
      const made = yield* newWorktree(TARGET, () => undefined).pipe(Effect.provide(layer));
      assert.deepStrictEqual(made, {
        outcome: { _tag: "Ended", code: Option.some(0), gone: [], problems: [] },
        switched: Option.some({ branch: "feat", path: "/r/app.feat" }),
        problems: ["Couldn't remove the temp folder /tmp/t1: rm: busy"],
      });
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
        problems: [],
      });
      assert.deepStrictEqual(log, [["mktemp"]]);
    }),
  );
});

describe("pickGroupFolder", () => {
  it.effect("the folder picked in the folder picker, or none when it was cancelled", () =>
    Effect.gen(function* () {
      const answers = ["/Users/me/oss", null];
      const api: FilesApi = {
        ...disk({}).api,
        pickFolder: () => Promise.resolve(answers.shift() ?? null),
      };
      const files = Files.layer(api);
      const picked = yield* pickGroupFolder().pipe(Effect.provide(files));
      const cancelled = yield* pickGroupFolder().pipe(Effect.provide(files));
      assert.deepStrictEqual(
        [picked, cancelled],
        [Result.succeed(Option.some("/Users/me/oss")), Result.succeed(Option.none())],
      );
    }),
  );

  it.effect("a folder picker that can't be shown says why", () =>
    Effect.gen(function* () {
      const api: FilesApi = { ...disk({}).api, pickFolder: () => Promise.reject("no window") };
      const picked = yield* pickGroupFolder().pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(picked, Result.fail("couldn't open the folder picker (no window)"));
    }),
  );
});

describe("addGroupFolderOn", () => {
  /**
   * A machine whose home is `home` and whose folders are `folders`: `$HOME` reads give the
   * home, and any other run is the folder check of its last argument, which exits 1 for a
   * folder it doesn't have. Records each run's machine and last argument.
   */
  const machine = (home: string, folders: readonly string[]) => {
    const ran: unknown[] = [];
    const api: ExecApi = {
      exec: (_command, args = [], options) => {
        const last = args.at(-1) ?? "";
        ran.push([options?.on, last]);
        if (last.includes("$HOME")) return Promise.resolve({ code: 0, stdout: home, stderr: "" });
        return Promise.resolve({ code: folders.includes(last) ? 0 : 1, stdout: "", stderr: "" });
      },
      hc: noHc,
    };
    return { api, ran };
  };

  it.effect("checks the typed folder on the picked machine, then adds it there", () =>
    Effect.gen(function* () {
      const { api, ran } = machine("/home/me", ["/srv/code"]);
      const added = yield* addGroupFolderOn(DEFAULT_SETTINGS, "linux", "/srv/code").pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        [added, ran.at(-1)],
        [
          Result.succeed({
            ...DEFAULT_SETTINGS,
            folders: [{ name: "code", path: "/srv/code", machine: "linux" }],
          }),
          ["linux", "/srv/code"],
        ],
      );
    }),
  );

  it.effect("a folder that isn't there on that machine is reported, and not added", () =>
    Effect.gen(function* () {
      const { api } = machine("/home/me", ["/srv/code"]);
      const added = yield* addGroupFolderOn(DEFAULT_SETTINGS, "linux", "/srv/cdoe").pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(added, Result.fail("/srv/cdoe isn't a folder on linux"));
    }),
  );

  it.effect("~ is the picked machine's home, read there, and the folder keeps it", () =>
    Effect.gen(function* () {
      const { api, ran } = machine("/home/me", ["/home/me/code"]);
      const added = yield* addGroupFolderOn(DEFAULT_SETTINGS, "linux", "~/code").pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        [added, ran],
        [
          Result.succeed({
            ...DEFAULT_SETTINGS,
            folders: [{ name: "code", path: "~/code", machine: "linux" }],
          }),
          [
            ["linux", 'printf %s "$HOME"'],
            ["linux", "/home/me/code"],
          ],
        ],
      );
    }),
  );

  it.effect("a check that can't run on that machine is reported with why, and adds nothing", () =>
    Effect.gen(function* () {
      const api: ExecApi = {
        exec: () => Promise.resolve({ code: 255, stdout: "", stderr: "ssh: connect: refused" }),
        hc: noHc,
      };
      const added = yield* addGroupFolderOn(DEFAULT_SETTINGS, "linux", "/srv/code").pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual(
        added,
        Result.fail("couldn't check /srv/code on linux: ssh: connect: refused"),
      );
    }),
  );

  it.effect("a blank folder asks for one, and runs nothing", () =>
    Effect.gen(function* () {
      const { api, ran } = machine("/home/me", []);
      const added = yield* addGroupFolderOn(DEFAULT_SETTINGS, "linux", "  ").pipe(
        Effect.provide(Shell.layer(api)),
      );
      assert.deepStrictEqual([added, ran], [Result.fail("Type the folder's path on linux"), []]);
    }),
  );
});

describe("settingsText", () => {
  it.effect("the settings file's text, as the dialog opens on it", () =>
    Effect.gen(function* () {
      const { api } = disk({ [FILES.path]: WORK });
      const text = yield* settingsText(FILES).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(text, Result.succeed(WORK));
    }),
  );

  it.effect("no settings file: null, so the dialog opens on the defaults", () =>
    Effect.gen(function* () {
      const { api } = disk({});
      const text = yield* settingsText(FILES).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(text, Result.succeed(null));
    }),
  );

  it.effect("a settings file that can't be read: the answer says so, and why", () =>
    Effect.gen(function* () {
      const api: FilesApi = { ...disk({}).api, readTextFile: () => Promise.reject("EACCES") };
      const text = yield* settingsText(FILES).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        text,
        Result.fail("iangregsondev-worktrunk.json: couldn't read it (EACCES)"),
      );
    }),
  );
});

describe("saveSettings", () => {
  const edited = {
    ...DEFAULT_SETTINGS,
    folders: [{ name: "Work", path: "~/w", machine: THIS_MACHINE }],
    depth: 5,
  };
  const CHANGED =
    "The settings file changed since this dialog opened, so nothing was saved. Close and open Settings again to edit the new file.";

  it.effect("writes the settings over the file, expecting it as the dialog opened on it", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.path]: WORK });
      const saved = yield* saveSettings(FILES, WORK, edited).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        [saved, writes],
        [Result.succeed("Saved"), [[FILES.path, serializeSettings(edited), WORK]]],
      );
    }),
  );

  it.effect("with no file when the dialog opened, creates it", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({});
      const saved = yield* saveSettings(FILES, null, edited).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        [saved, writes],
        [Result.succeed("Saved"), [[FILES.path, serializeSettings(edited), null]]],
      );
    }),
  );

  it.effect("settings unchanged since the dialog opened: nothing is written", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [FILES.path]: WORK });
      const same = parseSettings(WORK, FILES.name).settings;
      const saved = yield* saveSettings(FILES, WORK, same).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual([saved, writes], [Result.succeed("Unchanged"), []]);
    }),
  );

  it.effect(
    "a hand edit made since the dialog opened is never written over: the answer says so",
    () =>
      Effect.gen(function* () {
        const { api, writes } = disk({ [FILES.path]: "{}" });
        const saved = yield* saveSettings(FILES, WORK, edited).pipe(
          Effect.provide(Files.layer(api)),
        );
        assert.deepStrictEqual([saved, writes], [Result.fail(CHANGED), []]);
      }),
  );

  it.effect("a hand edit landing while it saves is never written over: the answer says so", () =>
    Effect.gen(function* () {
      const files: Record<string, string> = { [FILES.path]: WORK };
      const api: FilesApi = {
        readTextFile: (path) => Promise.resolve(files[path] ?? null),
        // The person saves the file between the check and the write.
        writeTextFile: (path) => {
          files[path] = "{}";
          return Promise.reject(new Error("stale"));
        },
        pickFolder: noPicker,
        exec: noExec,
      };
      const saved = yield* saveSettings(FILES, WORK, edited).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(saved, Result.fail(CHANGED));
    }),
  );

  it.effect("a settings file made by hand while it creates one is never written over", () =>
    Effect.gen(function* () {
      const files: Record<string, string> = {};
      const api: FilesApi = {
        readTextFile: (path) => Promise.resolve(files[path] ?? null),
        // The person makes the file between the check and the write.
        writeTextFile: (path) => {
          files[path] = "{}";
          return Promise.reject(new Error("exists"));
        },
        pickFolder: noPicker,
        exec: noExec,
      };
      const saved = yield* saveSettings(FILES, null, edited).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual([saved, files], [Result.fail(CHANGED), { [FILES.path]: "{}" }]);
    }),
  );

  it.effect(
    "a file that didn't parse when the dialog opened is never replaced: the answer says why",
    () =>
      Effect.gen(function* () {
        const broken = '{"depth": "4"}';
        const { api, writes } = disk({ [FILES.path]: broken });
        const saved = yield* saveSettings(FILES, broken, edited).pipe(
          Effect.provide(Files.layer(api)),
        );
        assert.deepStrictEqual(
          [saved, writes],
          [
            Result.fail(
              'iangregsondev-worktrunk.json: "depth" must be a number. Fix the file by hand; Settings can\'t save over it.',
            ),
            [],
          ],
        );
      }),
  );

  it.effect("a settings file that can't be read now is left alone: the answer says why", () =>
    Effect.gen(function* () {
      const writes: unknown[] = [];
      const api: FilesApi = {
        readTextFile: () => Promise.reject(new Error("no access")),
        writeTextFile: (path) => {
          writes.push(path);
          return Promise.resolve(null);
        },
        pickFolder: noPicker,
        exec: noExec,
      };
      const saved = yield* saveSettings(FILES, WORK, edited).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(
        [saved, writes],
        [Result.fail("iangregsondev-worktrunk.json: couldn't read it (no access)"), []],
      );
    }),
  );

  it.effect(
    "a settings file that can't be written: the answer says it couldn't be saved, and why",
    () =>
      Effect.gen(function* () {
        const api: FilesApi = {
          readTextFile: () => Promise.resolve(WORK),
          writeTextFile: () => Promise.reject(new Error("disk full")),
          pickFolder: noPicker,
          exec: noExec,
        };
        const saved = yield* saveSettings(FILES, WORK, edited).pipe(
          Effect.provide(Files.layer(api)),
        );
        assert.deepStrictEqual(
          saved,
          Result.fail("iangregsondev-worktrunk.json: couldn't save it (disk full)"),
        );
      }),
  );
});
