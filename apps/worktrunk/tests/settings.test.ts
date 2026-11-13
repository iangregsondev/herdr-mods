import { THIS_MACHINE } from "../src/machines.ts";
import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  addFolder,
  DEFAULT_SETTINGS,
  hideRepo,
  moveFolder,
  parseSettings,
  planImport,
  planSave,
  removeFolder,
  serializeSettings,
  skipText,
  tildePath,
  unhide,
  withFields,
  type Settings,
} from "../src/settings.ts";

/** A repo on this machine. */
const here = (root: string) => ({ machine: THIS_MACHINE, root });

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

  test("a hidden repo written as a bare folder is on this machine", () => {
    const text = JSON.stringify({ hidden: ["/code/old", "/code/odd"] });
    expect(parseSettings(text, FILE).settings.hidden).toEqual([
      { machine: THIS_MACHINE, root: "/code/old" },
      { machine: THIS_MACHINE, root: "/code/odd" },
    ]);
  });

  test("a hidden repo written with its machine is on that machine", () => {
    const text = JSON.stringify({
      hidden: ["/code/old", { machine: "linux", path: "/code/old" }],
    });
    expect(parseSettings(text, FILE).settings.hidden).toEqual([
      here("/code/old"),
      { machine: "linux", root: "/code/old" },
    ]);
  });

  test("blank hidden entries are dropped", () => {
    const text = JSON.stringify({ hidden: ["", "/code/old"] });
    expect(parseSettings(text, FILE).settings.hidden).toEqual([here("/code/old")]);
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
      hidden: [here("/r/old")],
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
      hidden: [here("/r/old")],
      noWrapper: true,
    };
    expect(parseSettings(serializeSettings(settings), FILE).settings).toEqual(settings);
  });

  test("a hidden repo on another machine is written with its machine", () => {
    const text = serializeSettings({
      ...DEFAULT_SETTINGS,
      hidden: [here("/r/old"), { machine: "linux", root: "/r/old" }],
    });
    expect(JSON.parse(text).hidden).toEqual(["/r/old", { machine: "linux", path: "/r/old" }]);
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
    hidden: [here("/w/old")],
  });
  const settingsOf = (result: Result.Result<string, string>) =>
    Result.map(result, (text) => parseSettings(text, FILE).settings);

  test("adds the repo to the file's hidden list and keeps the rest", () => {
    expect(settingsOf(hideRepo(file, here("/w/api"), FILE))).toEqual(
      Result.succeed({
        ...DEFAULT_SETTINGS,
        folders: [{ name: "W", path: "~/w" }],
        hidden: [here("/w/old"), here("/w/api")],
      }),
    );
  });

  test("hiding a folder hidden on this machine hides it on another machine too", () => {
    expect(settingsOf(hideRepo(file, { machine: "linux", root: "/w/old" }, FILE))).toEqual(
      Result.succeed({
        ...DEFAULT_SETTINGS,
        folders: [{ name: "W", path: "~/w" }],
        hidden: [here("/w/old"), { machine: "linux", root: "/w/old" }],
      }),
    );
  });

  test("hiding a hidden repo leaves the file as it is, hand formatting and all", () => {
    const handMade = '{ "hidden": ["/w/old"] }';
    expect(hideRepo(handMade, here("/w/old"), FILE)).toEqual(Result.succeed(handMade));
  });

  test("with no settings file yet, hiding writes one", () => {
    expect(settingsOf(hideRepo(null, here("/w/api"), FILE))).toEqual(
      Result.succeed({ ...DEFAULT_SETTINGS, hidden: [here("/w/api")] }),
    );
  });

  test("a file that doesn't parse is never replaced: hiding fails with the reason", () => {
    expect(hideRepo('{"depth": ', here("/w/api"), FILE)).toEqual(
      Result.fail(Option.getOrThrow(parseSettings('{"depth": ', FILE).error)),
    );
  });
});

describe("planSave", () => {
  const opened = serializeSettings({ ...DEFAULT_SETTINGS, depth: 3 });
  const edited = { ...DEFAULT_SETTINGS, depth: 5 };

  test("writes the new settings, expecting the file as it was when the dialog opened", () => {
    expect(planSave(opened, opened, edited, FILE)).toEqual({
      _tag: "Write",
      text: serializeSettings(edited),
      expected: opened,
    });
  });

  test("a hand edit made since the dialog opened is never overwritten", () => {
    const handEdited = serializeSettings({ ...DEFAULT_SETTINGS, depth: 7 });
    expect(planSave(opened, handEdited, edited, FILE)).toEqual({ _tag: "Changed" });
  });

  test("a file made by hand since the dialog opened on none is never overwritten", () => {
    expect(planSave(null, "{}", edited, FILE)).toEqual({ _tag: "Changed" });
  });

  test("with no file when the dialog opened, saving creates it", () => {
    expect(planSave(null, null, edited, FILE)).toEqual({
      _tag: "Write",
      text: serializeSettings(edited),
      expected: null,
    });
  });

  test("saving unchanged settings leaves a hand-formatted file as it is", () => {
    const handFormatted = '{ "depth": 3 }\n';
    expect(planSave(handFormatted, handFormatted, { ...DEFAULT_SETTINGS, depth: 3 }, FILE)).toEqual(
      { _tag: "Unchanged" },
    );
  });

  test("a file that didn't parse when the dialog opened is never replaced", () => {
    const broken = '{"depth": ';
    expect(planSave(broken, broken, edited, FILE)).toEqual({
      _tag: "Broken",
      error: Option.getOrThrow(parseSettings(broken, FILE).error),
    });
  });
});

describe("editing in the Settings dialog", () => {
  const HOME = "/Users/me";
  const two = {
    ...DEFAULT_SETTINGS,
    folders: [
      { name: "Work", path: "~/code/work" },
      { name: "Personal", path: "~/code/personal" },
    ],
  };
  const names = (settings: Settings) => settings.folders.map((folder) => folder.name);

  test("un-hiding a repo on one machine leaves the same folder on another hidden", () => {
    const linux = { machine: "linux", root: "/r/a" };
    const hidden = { ...DEFAULT_SETTINGS, hidden: [here("/r/a"), linux] };
    expect(unhide(hidden, linux).hidden).toEqual([here("/r/a")]);
  });

  test("un-hiding a repo takes it off the hidden list, the rest stay hidden", () => {
    const hidden = { ...DEFAULT_SETTINGS, hidden: [here("/r/a"), here("/r/b")] };
    expect(unhide(hidden, here("/r/a")).hidden).toEqual([here("/r/b")]);
  });

  test("a picked folder joins the end, under home written with ~, named after its last segment", () => {
    expect(addFolder(two, "/Users/me/src/oss/", HOME).folders).toEqual([
      ...two.folders,
      { name: "oss", path: "~/src/oss" },
    ]);
  });

  test("a folder outside home keeps its full path", () => {
    expect(addFolder(DEFAULT_SETTINGS, "/Volumes/x", HOME).folders).toEqual([
      { name: "x", path: "/Volumes/x" },
    ]);
  });

  test("the home folder itself is written ~, and a folder that only starts like it is not", () => {
    expect([tildePath(HOME, HOME), tildePath("/Users/meg", HOME)]).toEqual(["~", "/Users/meg"]);
  });

  test("picking a folder already in the list changes nothing", () => {
    expect(addFolder(two, "/Users/me/code/work", HOME)).toBe(two);
  });

  test("a blank pick changes nothing", () => {
    expect(addFolder(two, " / ", HOME)).toBe(two);
  });

  test("moving a folder up or down changes the group order", () => {
    expect([names(moveFolder(two, 1, -1)), names(moveFolder(two, 0, 1))]).toEqual([
      ["Personal", "Work"],
      ["Personal", "Work"],
    ]);
  });

  test("moving a folder past either end changes nothing", () => {
    expect(moveFolder(two, 0, -1)).toBe(two);
    expect(moveFolder(two, 1, 1)).toBe(two);
    expect(moveFolder(two, 5, -1)).toBe(two);
  });

  test("removing a folder keeps the others in order", () => {
    const three = { ...two, folders: [...two.folders, { name: "Oss", path: "~/oss" }] };
    expect(names(removeFolder(three, 1))).toEqual(["Work", "Oss"]);
  });

  test("the skip field shows the names joined with commas", () => {
    expect(skipText(["node_modules", ".cache"])).toBe("node_modules, .cache");
  });

  test("the name fields name the folders, trimmed", () => {
    const next = withFields(two, { names: [" Jobs ", "Home"], skip: "", depth: 4 });
    expect(next.folders).toEqual([
      { name: "Jobs", path: "~/code/work" },
      { name: "Home", path: "~/code/personal" },
    ]);
  });

  test("a blank name field names the folder after its last segment", () => {
    const next = withFields(two, { names: ["Work", "  "], skip: "", depth: 4 });
    expect(names(next)).toEqual(["Work", "personal"]);
  });

  test("the skip field is split on commas, each name trimmed, blanks dropped", () => {
    const next = withFields(two, { names: [], skip: " dist, ,vendor,", depth: 4 });
    expect(next.skip).toEqual(["dist", "vendor"]);
  });

  test("the depth is kept to a whole number from 1 to 8", () => {
    const depthOf = (depth: number) => withFields(two, { names: [], skip: "", depth }).depth;
    expect([depthOf(11), depthOf(0), depthOf(2.6)]).toEqual([8, 1, 3]);
  });

  test("the no-wrapper setting saves to the file and reads back", () => {
    const opened = serializeSettings(DEFAULT_SETTINGS);
    const plan = planSave(opened, opened, { ...DEFAULT_SETTINGS, noWrapper: true }, FILE);
    const text = plan._tag === "Write" ? plan.text : "";
    expect([
      text.includes('"noWrapper": true'),
      parseSettings(text, FILE).settings.noWrapper,
    ]).toEqual([true, true]);
  });

  test("every field round-trips through a save", () => {
    const opened = serializeSettings(two);
    const edited = withFields(
      unhide(
        moveFolder(addFolder({ ...two, hidden: [here("/r/a")] }, "/Users/me/oss", HOME), 2, -1),
        here("/r/a"),
      ),
      { names: ["W", "O", "P"], skip: "vendor", depth: 2 },
    );
    const plan = planSave(opened, opened, { ...edited, noWrapper: true }, FILE);
    const text = plan._tag === "Write" ? plan.text : "";
    expect(parseSettings(text, FILE).settings).toEqual({
      folders: [
        { name: "W", path: "~/code/work" },
        { name: "O", path: "~/oss" },
        { name: "P", path: "~/code/personal" },
      ],
      depth: 2,
      skip: ["vendor"],
      hidden: [],
      noWrapper: true,
    });
  });
});
