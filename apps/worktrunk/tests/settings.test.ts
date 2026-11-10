import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_SETTINGS, parseSettings, planImport, serializeSettings } from "../src/settings.ts";

const FILE = "iangregsondev-worktrunk.json";

describe("DEFAULT_SETTINGS", () => {
  test("no folders, depth 4, skip node_modules and .cache", () => {
    expect(DEFAULT_SETTINGS).toEqual({ folders: [], depth: 4, skip: ["node_modules", ".cache"] });
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
      },
      error: Option.none(),
    });
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
      skip: ["a"],
      depth: 2,
      folders: [{ name: "W", path: "~/w" }],
    });
    expect(text).toBe(
      '{\n  "folders": [\n    {\n      "name": "W",\n      "path": "~/w"\n    }\n  ],\n  "depth": 2,\n  "skip": [\n    "a"\n  ]\n}\n',
    );
  });

  test("round-trips through parseSettings", () => {
    const settings = { folders: [{ name: "W", path: "~/w" }], depth: 5, skip: [] };
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
