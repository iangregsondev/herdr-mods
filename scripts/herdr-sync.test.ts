import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { herdrSync } from "./herdr-sync.ts";
import type { LayoutNode } from "./herdr-slots.ts";
import { age, readLayout, slot, tempDir, writeFile } from "./test-support.ts";

const MOD = "iangregsondev-worktrunk";

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** A small stand-in for Herdr's default layout: only the parts the sync looks for. */
const defaultLayout = (): LayoutNode => ({
  id: "root",
  type: "row",
  titlebar: "none",
  children: [
    { id: "sidebar", type: "column", size: { px: 268 }, children: [slot("spaces")] },
    {
      id: "work",
      type: "column",
      children: [
        {
          id: "tabs",
          type: "block",
          size: { px: 42 },
          window_drag: true,
          content: { mod: "tabs" },
        },
        {
          id: "work-body",
          type: "row",
          gap: 8,
          children: [
            { id: "main", type: "block", content: { tab: "active", pane: { gap: 8 } } },
            { id: "panel", type: "column", hidden: true, children: [slot("files")] },
          ],
        },
        slot("workspace-status"),
      ],
    },
  ],
});

/** The tab-bar row the sync should write in place of Herdr's tab bar, spelled out by hand. */
const expectedTabsRow = (): LayoutNode => ({
  id: "tabs-row",
  type: "row",
  size: { px: 42 },
  resizable: false,
  children: [
    {
      id: "tabs",
      type: "block",
      size: { weight: 1 },
      window_drag: true,
      content: { mod: "tabs" },
    },
    {
      id: "worktrunk-toggle",
      type: "block",
      size: { px: 112 },
      window_drag: true,
      content: { mod: MOD, props: { role: "toggle" } },
    },
  ],
});

/** The layout the sync should write from `defaultLayout()`, spelled out by hand. */
const expectedLayout = (): LayoutNode => ({
  id: "root",
  type: "row",
  titlebar: "none",
  children: [
    { id: "sidebar", type: "column", size: { px: 268 }, children: [slot("spaces")] },
    {
      id: "work",
      type: "column",
      children: [
        expectedTabsRow(),
        {
          id: "work-body",
          type: "row",
          gap: 8,
          children: [
            { id: "main", type: "block", content: { tab: "active", pane: { gap: 8 } } },
            { id: "panel", type: "column", hidden: true, children: [slot("files")] },
            {
              id: "worktrunk-panel",
              type: "block",
              size: { px: 380 },
              min: 280,
              max: 900,
              content: { mod: MOD },
            },
          ],
        },
        slot("workspace-status"),
      ],
    },
  ],
});

/** The node with `id` anywhere in `node`, or undefined. */
const nodeById = (node: LayoutNode, id: string): LayoutNode | undefined =>
  node.id === id
    ? node
    : (node.children ?? []).reduce<LayoutNode | undefined>(
        (found, child) => found ?? nodeById(child, id),
        undefined,
      );

/** A temp Herdr home holding `main` as the shipped default layout. */
const herdrHome = (main: string = json(defaultLayout())): string => {
  const home = tempDir();
  writeFile(home, "installed.json", json({ "layout:main": { json: "h1" }, tabs: {} }));
  writeFile(home, "layouts/main.json", main);
  writeFile(home, "mods/tabs/main.js", "export default class {}\n");
  return home;
};

/** A fake `herdr-app` that records each call's args and answers `--version`. */
const fakeHerdrApp = (version = "herdr-app 0.1.14") => {
  const calls: string[][] = [];
  const run = (args: readonly string[]): string => {
    calls.push([...args]);
    return `${version}\n`;
  };
  return { calls, run };
};

/** Every file under `dir`, by relative path, with its text. */
const snapshot = (dir: string): Map<string, string> => {
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(at, entry.name)) : [join(at, entry.name)],
    );
  return new Map(walk(dir).map((path) => [relative(dir, path), readFileSync(path, "utf8")]));
};

/** The relative paths whose text differs between two snapshots, or that only one has. */
const changedFiles = (before: Map<string, string>, after: Map<string, string>): string[] =>
  [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();

/** The sync record in `home`, parsed, or undefined when there is none. */
const readRecord = (home: string): unknown => {
  const path = join(home, "iangregsondev-sync.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
};

describe("herdrSync", () => {
  test("the tab bar becomes a row: Herdr's tabs, then the worktrunk toggle", () => {
    const home = herdrHome();
    herdrSync({ home, herdrApp: fakeHerdrApp().run });

    const written = readLayout(join(home, "layouts/iangregsondev.json"));
    expect(nodeById(written, "tabs-row")).toEqual(expectedTabsRow());
  });

  test("writes my layout: Herdr's default with the worktrunk toggle and panel added", () => {
    const home = herdrHome();
    herdrSync({ home, herdrApp: fakeHerdrApp().run });

    expect(readLayout(join(home, "layouts/iangregsondev.json"))).toEqual(expectedLayout());
  });

  test("records the Herdr version and the default layout it built from", () => {
    const home = herdrHome();
    herdrSync({ home, herdrApp: fakeHerdrApp("herdr-app 0.1.14").run });

    expect(readRecord(home)).toEqual({ layout: "iangregsondev", from: "main", version: "0.1.14" });
  });

  test("writes only my layout and the record, never Herdr's own files", () => {
    const home = herdrHome();
    const before = snapshot(home);
    herdrSync({ home, herdrApp: fakeHerdrApp().run });

    expect(changedFiles(before, snapshot(home))).toEqual([
      "iangregsondev-sync.json",
      join("layouts", "iangregsondev.json"),
    ]);
  });

  test("switches nothing: the only Herdr command it runs asks for the version", () => {
    const herdrApp = fakeHerdrApp();
    herdrSync({ home: herdrHome(), herdrApp: herdrApp.run });

    expect(herdrApp.calls).toEqual([["--version"]]);
  });

  test("says what it wrote and how to switch to it, with code 0", () => {
    const result = herdrSync({ home: herdrHome(), herdrApp: fakeHerdrApp().run });

    expect(result).toEqual({
      code: 0,
      out: [
        `herdr-sync: wrote layout "iangregsondev" from Herdr's "main" (Herdr 0.1.14).`,
        "herdr-sync: nothing switched. Switch to it with Herdr's layout switch (layout.switch), or: herdr-app do layout.switch --name iangregsondev",
      ],
      err: [],
    });
  });

  test("a second run rebuilds the same layout over its own earlier one", () => {
    const home = herdrHome();
    herdrSync({ home, herdrApp: fakeHerdrApp().run });
    const first = readFileSync(join(home, "layouts/iangregsondev.json"), "utf8");
    const again = herdrSync({ home, herdrApp: fakeHerdrApp().run });

    expect(again.code).toBe(0);
    expect(readFileSync(join(home, "layouts/iangregsondev.json"), "utf8")).toBe(first);
  });

  test("a second run with nothing new leaves both files as they were, so Herdr reloads nothing", () => {
    const home = herdrHome();
    herdrSync({ home, herdrApp: fakeHerdrApp().run });
    const layout = join(home, "layouts/iangregsondev.json");
    const record = join(home, "iangregsondev-sync.json");
    const mtimes = [age(layout), age(record)];
    herdrSync({ home, herdrApp: fakeHerdrApp().run });

    expect([statSync(layout).mtimeMs, statSync(record).mtimeMs]).toEqual(mtimes);
  });

  test("a new Herdr version rewrites the record", () => {
    const home = herdrHome();
    herdrSync({ home, herdrApp: fakeHerdrApp("herdr-app 0.1.14").run });
    herdrSync({ home, herdrApp: fakeHerdrApp("herdr-app 0.1.15").run });

    expect(readRecord(home)).toEqual({ layout: "iangregsondev", from: "main", version: "0.1.15" });
  });

  describe("fails loudly and writes nothing", () => {
    const failsNaming = (home: string, ...names: string[]) => {
      const before = snapshot(home);
      const result = herdrSync({ home, herdrApp: fakeHerdrApp().run });
      expect(result.code).toBe(1);
      names.forEach((name) => expect(result.err.join("\n")).toContain(name));
      expect(changedFiles(before, snapshot(home))).toEqual([]);
    };

    test("when the default layout has no tab bar", () => {
      const noTabs = JSON.stringify(defaultLayout()).replace('"mod":"tabs"', '"mod":"other"');
      failsNaming(herdrHome(noTabs), "tab-bar toggle", '"tabs"');
    });

    test("when the default layout has two tab bars", () => {
      const layout = defaultLayout();
      const twoTabs = { ...layout, children: [...(layout.children ?? []), slot("tabs")] };
      failsNaming(herdrHome(json(twoTabs)), "tab-bar toggle", "found 2");
    });

    test("when no row holds the active tab", () => {
      const noActive = JSON.stringify(defaultLayout()).replace('"tab":"active"', '"tab":"t1"');
      failsNaming(herdrHome(noActive), "worktrunk panel", "active tab");
    });

    test("when an id it adds is already in the default layout", () => {
      const layout = defaultLayout();
      const taken = { ...layout, children: [...(layout.children ?? []), slot("x")] };
      const clash = JSON.stringify(taken).replace('"id":"b-x"', '"id":"worktrunk-panel"');
      failsNaming(herdrHome(clash), "worktrunk panel", "worktrunk-panel");
    });

    test("when Herdr's default layout is missing or not JSON", () => {
      const missing = herdrHome();
      const before = snapshot(missing);
      const gone = herdrSync({ home: join(missing, "nowhere"), herdrApp: fakeHerdrApp().run });
      expect(gone.code).toBe(1);
      expect(gone.err.join("\n")).toContain("main.json");
      expect(changedFiles(before, snapshot(missing))).toEqual([]);

      failsNaming(herdrHome("{ not json"), "main.json");
    });

    test("when the Herdr version can't be found", () => {
      const home = herdrHome();
      const result = herdrSync({
        home,
        herdrApp: () => {
          throw new Error("spawn herdr-app ENOENT");
        },
      });
      expect(result.code).toBe(1);
      expect(result.err.join("\n")).toContain("version");
      expect(existsSync(join(home, "layouts/iangregsondev.json"))).toBe(false);
      expect(existsSync(join(home, "iangregsondev-sync.json"))).toBe(false);
    });

    test("when the version output has no version in it", () => {
      const home = herdrHome();
      const result = herdrSync({ home, herdrApp: fakeHerdrApp("herdr-app").run });
      expect(result.code).toBe(1);
      expect(existsSync(join(home, "iangregsondev-sync.json"))).toBe(false);
    });

    test("when Herdr ships a layout with my layout's name", () => {
      const home = herdrHome();
      writeFile(home, "installed.json", json({ "layout:main": {}, "layout:iangregsondev": {} }));
      writeFile(home, "layouts/iangregsondev.json", json(defaultLayout()));
      failsNaming(home, "ships with Herdr");
    });
  });
});
