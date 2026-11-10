import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  DEFAULT_SETTINGS,
  hideRepo,
  parseSettings,
  planImport,
  serializeSettings,
} from "../src/settings.ts";

const FILE = "iangregsondev-worktrunk.json";

describe("DEFAULT_SETTINGS", () => {
  test("no folders, depth 4, skip node_modules and .cache, nothing hidden, wt's wrapper on", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      folders: [],
      depth: 4,
      skip: ["node_modules", ".cache"],
      hidden: [],
      noWrapper: false,
    });
  });
});

describe("parseSettings", () => {
  test("no file gives the defaults and no error", () => {
    expect(parseSettings(null, FILE)).toEqual({
      settings: DEFAULT_SETTINGS,
      error: Option.none(),
    });
  });

  test("an empty file gives the defaults and no error", () => {
    expect(parseSettings("  \n", FILE)).toEqual({
      settings: DEFAULT_SETTINGS,
      error: Option.none(),
    });
  });

  test("reads folders, depth and skip", () => {
    const text = JSON.stringify({
      folders: [{ name: "Work", path: "~/code/work" }],
      depth: 3,
      skip: ["vendor"],
    });
    expect(parseSettings(text, FILE)).toEqual({
      settings: {
        folders: [{ name: "Work", path: "~/code/work" }],
        depth: 3,
        skip: ["vendor"],
        hidden: [],
        noWrapper: false,
      },
      error: Option.none(),
    });
  });

  test("reads the hidden repos", () => {
    const text = JSON.stringify({ hidden: ["/code/old", "/code/odd"] });
    expect(parseSettings(text, FILE).settings.hidden).toEqual(["/code/old", "/code/odd"]);
  });

  test("blank hidden entries are dropped", () => {
    const text = JSON.stringify({ hidden: ["", "/code/old"] });
    expect(parseSettings(text, FILE).settings.hidden).toEqual(["/code/old"]);
  });

  test("reads the no-wrapper setting", () => {
    expect(parseSettings('{"noWrapper": true}', FILE).settings.noWrapper).toBe(true);
  });

  test("missing keys take their defaults", () => {
    expect(parseSettings("{}", FILE).settings).toEqual(DEFAULT_SETTINGS);
  });

  test("broken JSON gives the defaults and an error naming the file", () => {
    const { settings, error } = parseSettings('{"depth": ', FILE);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(Option.getOrThrow(error)).toMatch(/^iangregsondev-worktrunk\.json: /);
  });

  test("a folder without a name is named after its last segment", () => {
    const text = JSON.stringify({ folders: [{ path: "~/code/Personal/" }] });
    expect(parseSettings(text, FILE).settings.folders).toEqual([
      { name: "Personal", path: "~/code/Personal" },
    ]);
  });

  test("blank folder paths and blank skip names are dropped, the rest trimmed", () => {
    const text = JSON.stringify({
      folders: [{ name: " Work ", path: " ~/w " }, { path: "  " }],
      skip: [" dist ", ""],
    });
    expect(parseSettings(text, FILE).settings).toMatchObject({
      folders: [{ name: "Work", path: "~/w" }],
      skip: ["dist"],
    });
  });

  test("depth is a whole number from 1 to 8", () => {
    expect(parseSettings('{"depth": 0}', FILE).settings.depth).toBe(1);
    expect(parseSettings('{"depth": 20}', FILE).settings.depth).toBe(8);
    expect(parseSettings('{"depth": 2.6}', FILE).settings.depth).toBe(3);
  });

  test("the wrong shape is an error too, never a half-read file", () => {
    const { settings, error } = parseSettings('{"folders": "~/w", "depth": 2}', FILE);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(error).toEqual(
      Option.some('iangregsondev-worktrunk.json: "folders" must be a list of { "name", "path" }'),
    );
  });

  test("a depth that isn't a number is an error", () => {
    expect(parseSettings('{"depth": "4"}', FILE)).toEqual({
      settings: DEFAULT_SETTINGS,
      error: Option.some('iangregsondev-worktrunk.json: "depth" must be a number'),
    });
  });

  test("skip that isn't a list of names is an error", () => {
    expect(parseSettings('{"skip": "dist"}', FILE)).toEqual({
      settings: DEFAULT_SETTINGS,
      error: Option.some('iangregsondev-worktrunk.json: "skip" must be a list of folder names'),
    });
  });

  test("hidden that isn't a list of folders is an error", () => {
    expect(parseSettings('{"hidden": "/code/old"}', FILE)).toEqual({
      settings: DEFAULT_SETTINGS,
      error: Option.some('iangregsondev-worktrunk.json: "hidden" must be a list of repo folders'),
    });
  });

  test("a no-wrapper setting that isn't true or false is an error", () => {
    expect(parseSettings('{"noWrapper": "yes"}', FILE)).toEqual({
      settings: DEFAULT_SETTINGS,
      error: Option.some('iangregsondev-worktrunk.json: "noWrapper" must be true or false'),
    });
  });

  test("a file that isn't a JSON object is an error", () => {
    expect(parseSettings("[1, 2]", FILE)).toEqual({
      settings: DEFAULT_SETTINGS,
      error: Option.some("iangregsondev-worktrunk.json: expected a JSON object"),
    });
  });
});

describe("serializeSettings", () => {
  test("stable key order, two-space indent, trailing newline", () => {
    const text = serializeSettings({
      noWrapper: true,
      hidden: ["/r/old"],
      skip: ["a"],
      depth: 2,
      folders: [{ name: "W", path: "~/w" }],
    });
    expect(text).toBe(
      '{\n  "folders": [\n    {\n      "name": "W",\n      "path": "~/w"\n    }\n  ],\n  "depth": 2,\n  "skip": [\n    "a"\n  ],\n  "hidden": [\n    "/r/old"\n  ],\n  "noWrapper": true\n}\n',
    );
  });

  test("round-trips through parseSettings", () => {
    const settings = {
      folders: [{ name: "W", path: "~/w" }],
      depth: 5,
      skip: [],
      hidden: ["/r/old"],
      noWrapper: true,
    };
    expect(parseSettings(serializeSettings(settings), FILE).settings).toEqual(settings);
  });
});

describe("planImport", () => {
  const legacy = JSON.stringify({
    folders: [{ name: "Personal", path: "~/code/personal" }],
    depth: 4,
    skip: ["node_modules"],
  });

  test("the first run with no settings file copies the old file and settles the import", () => {
    const plan = planImport(null, legacy, false);
    expect(plan.settled).toBe(true);
    expect(Option.map(plan.write, (text) => parseSettings(text, FILE).settings)).toEqual(
      Option.some({
        folders: [{ name: "Personal", path: "~/code/personal" }],
        depth: 4,
        skip: ["node_modules"],
        hidden: [],
        noWrapper: false,
      }),
    );
  });

  test("once settled, a deleted settings file is never imported again", () => {
    expect(planImport(null, legacy, true)).toEqual({ write: Option.none(), settled: true });
  });

  test("a settings file that exists settles the import without copying", () => {
    expect(planImport("{}", legacy, false)).toEqual({ write: Option.none(), settled: true });
  });

  test("with no old file to copy, nothing is settled", () => {
    expect(planImport(null, null, false)).toEqual({ write: Option.none(), settled: false });
  });

  test("an old file that doesn't parse settles nothing", () => {
    expect(planImport(null, "{oops", false)).toEqual({ write: Option.none(), settled: false });
  });
});

describe("hideRepo", () => {
  const file = serializeSettings({
    ...DEFAULT_SETTINGS,
    folders: [{ name: "W", path: "~/w" }],
    hidden: ["/w/old"],
  });
  const settingsOf = (result: Result.Result<string, string>) =>
    Result.map(result, (text) => parseSettings(text, FILE).settings);

  test("adds the repo to the file's hidden list and keeps the rest", () => {
    expect(settingsOf(hideRepo(file, "/w/api", FILE))).toEqual(
      Result.succeed({
        ...DEFAULT_SETTINGS,
        folders: [{ name: "W", path: "~/w" }],
        hidden: ["/w/old", "/w/api"],
      }),
    );
  });

  test("hiding a hidden repo leaves the file as it is, hand formatting and all", () => {
    const handMade = '{ "hidden": ["/w/old"] }';
    expect(hideRepo(handMade, "/w/old", FILE)).toEqual(Result.succeed(handMade));
  });

  test("with no settings file yet, hiding writes one", () => {
    expect(settingsOf(hideRepo(null, "/w/api", FILE))).toEqual(
      Result.succeed({ ...DEFAULT_SETTINGS, hidden: ["/w/api"] }),
    );
  });

  test("a file that doesn't parse is never replaced: hiding fails with the reason", () => {
    expect(hideRepo('{"depth": ', "/w/api", FILE)).toEqual(
      Result.fail(Option.getOrThrow(parseSettings('{"depth": ', FILE).error)),
    );
  });
});
