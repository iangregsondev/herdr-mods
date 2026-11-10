import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  ensureSlot,
  hasSlot,
  herdrHome,
  layoutFromStatus,
  removeSlots,
  withSlot,
  withoutSlots,
  type HerdrStatus,
  type LayoutNode,
} from "./herdr-slots.ts";
import { age, fakeBin, readLayout, slot, tempDir, writeFile } from "./test-support.ts";

/** A node's children; empty when it has none, so a missing list fails on the assertion. */
const childrenOf = (node: LayoutNode | null): LayoutNode[] => node?.children ?? [];

const layout = (): LayoutNode => ({
  id: "root",
  type: "row",
  children: [
    { id: "sidebar", type: "column", children: [slot("spaces")] },
    { id: "work", type: "column", children: [slot("hello"), slot("tabs")] },
    slot("hello"),
  ],
});

describe("hasSlot", () => {
  test("finds a slot nested anywhere", () => {
    expect(hasSlot(layout(), "hello")).toBe(true);
    expect(hasSlot(layout(), "spaces")).toBe(true);
  });

  test("is false when the mod has no slot", () => {
    expect(hasSlot(layout(), "other")).toBe(false);
  });
});

describe("withoutSlots", () => {
  test("removes every slot for the mod, at any depth, and counts them", () => {
    const { node, removed } = withoutSlots(layout(), "hello");
    expect(removed).toBe(2);
    expect(hasSlot(node, "hello")).toBe(false);
    expect(hasSlot(node, "tabs")).toBe(true);
    expect(hasSlot(node, "spaces")).toBe(true);
  });

  test("leaves the tree alone when there is nothing to remove", () => {
    const { node, removed } = withoutSlots(layout(), "other");
    expect(removed).toBe(0);
    expect(node).toEqual(layout());
  });
});

describe("withSlot", () => {
  const bare = (): LayoutNode => withoutSlots(layout(), "hello").node;

  test("right docks at the end of the root row, with the mod's size", () => {
    const children = childrenOf(withSlot(bare(), "hello", "right", 240));
    expect(children).toHaveLength(3);
    expect(children.at(-1)).toMatchObject({
      type: "block",
      content: { mod: "hello" },
      size: { px: 240 },
      id: expect.stringMatching(/^b[0-9a-f]{32}$/),
    });
  });

  test("left docks at the start", () => {
    const children = childrenOf(withSlot(bare(), "hello", "left", 240));
    expect(children[0]).toMatchObject({ content: { mod: "hello" } });
  });

  test("leaves size out when mod.json has none", () => {
    const children = childrenOf(withSlot(bare(), "hello", "right", undefined));
    expect(children.at(-1)).toMatchObject({ content: { mod: "hello" } });
    expect(children.at(-1)).not.toHaveProperty("size");
  });

  test("won't guess for other places or a root that isn't a row", () => {
    expect(withSlot(bare(), "hello", "top", 240)).toBeNull();
    expect(withSlot(bare(), "hello", "none", 240)).toBeNull();
    expect(withSlot({ ...bare(), type: "column" }, "hello", "right", 240)).toBeNull();
  });
});

describe("layoutFromStatus", () => {
  test("reads the shown layout's name", () => {
    expect(layoutFromStatus('{"layout":"work","errors":[]}')).toBe("work");
  });

  test("is null when the layout field is missing, empty or not a string", () => {
    expect(layoutFromStatus('{"errors":[]}')).toBeNull();
    expect(layoutFromStatus('{"layout":""}')).toBeNull();
    expect(layoutFromStatus('{"layout":42}')).toBeNull();
    expect(layoutFromStatus('{"layout":{"name":"work"}}')).toBeNull();
  });

  test("is null when the status isn't a JSON object", () => {
    expect(layoutFromStatus("null")).toBeNull();
    expect(layoutFromStatus('"work"')).toBeNull();
    expect(layoutFromStatus("not json")).toBeNull();
  });
});

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

describe("removeSlots", () => {
  test("is empty when there is no layouts folder", () => {
    expect(removeSlots("hello", tempDir())).toEqual({ changed: [], kept: [], skipped: [] });
  });

  test("removes the mod's slots from the person's layouts and names them", () => {
    const home = tempDir();
    const work = writeFile(home, "layouts/work.json", json(layout()));
    const play = writeFile(home, "layouts/play.json", json(layout()));

    expect(removeSlots("hello", home)).toEqual({
      changed: ["play", "work"],
      kept: [],
      skipped: [],
    });
    expect(readLayout(work)).toEqual(withoutSlots(layout(), "hello").node);
    expect(readLayout(play)).toEqual(withoutSlots(layout(), "hello").node);
  });

  test("leaves layouts that ship with Herdr alone", () => {
    const home = tempDir();
    writeFile(home, "installed.json", json({ "layout:shipped": {}, "mod:hello": {} }));
    const shipped = writeFile(home, "layouts/shipped.json", json(layout()));
    const mine = writeFile(home, "layouts/mine.json", json(layout()));

    expect(removeSlots("hello", home)).toEqual({ changed: ["mine"], kept: [], skipped: [] });
    expect(readFileSync(shipped, "utf8")).toBe(json(layout()));
    expect(hasSlot(readLayout(mine), "hello")).toBe(false);
  });

  test("never writes a layout it is told to keep, and names it when it holds a slot", () => {
    const home = tempDir();
    const synced = writeFile(home, "layouts/synced.json", json(layout()));
    const mine = writeFile(home, "layouts/mine.json", json(layout()));

    expect(removeSlots("hello", home, ["synced", "absent"])).toEqual({
      changed: ["mine"],
      kept: ["synced"],
      skipped: [],
    });
    expect(readFileSync(synced, "utf8")).toBe(json(layout()));
    expect(hasSlot(readLayout(mine), "hello")).toBe(false);
  });

  test("skips files that aren't .json", () => {
    const home = tempDir();
    const backup = writeFile(home, "layouts/work.json.bak", json(layout()));

    expect(removeSlots("hello", home)).toEqual({ changed: [], kept: [], skipped: [] });
    expect(readFileSync(backup, "utf8")).toBe(json(layout()));
  });

  test("doesn't rewrite a layout with no slot for the mod", () => {
    const home = tempDir();
    const content = json(layout());
    const work = writeFile(home, "layouts/work.json", content);
    const mtime = age(work);

    expect(removeSlots("other", home)).toEqual({ changed: [], kept: [], skipped: [] });
    expect(readFileSync(work, "utf8")).toBe(content);
    expect(statSync(work).mtimeMs).toBe(mtime);
  });

  test.each([
    ["missing", undefined],
    ["null", "null"],
    ["an array", json(["layout:work"])],
  ])("treats installed.json that is %s as no shipped layouts", (_label, installed) => {
    const home = tempDir();
    if (installed !== undefined) writeFile(home, "installed.json", installed);
    writeFile(home, "layouts/work.json", json(layout()));

    expect(removeSlots("hello", home)).toEqual({ changed: ["work"], kept: [], skipped: [] });
  });

  test("names the layouts it changed in name order, whatever order they were written", () => {
    const home = tempDir();
    ["zebra", "apple", "mango"].forEach((name) =>
      writeFile(home, `layouts/${name}.json`, json(layout())),
    );

    expect(removeSlots("hello", home)).toEqual({
      changed: ["apple", "mango", "zebra"],
      kept: [],
      skipped: [],
    });
  });

  test("skips and names layouts it can't parse or walk, leaves them as they are, and still cleans the rest", () => {
    const home = tempDir();
    const broken = "{ not json";
    const unwalkable = json({ id: "root", type: "row", children: 5 });
    const zed = writeFile(home, "layouts/zed.json", json(layout()));
    const notJson = writeFile(home, "layouts/broken.json", broken);
    const odd = writeFile(home, "layouts/odd.json", unwalkable);
    const alpha = writeFile(home, "layouts/alpha.json", json(layout()));

    expect(removeSlots("hello", home)).toEqual({
      changed: ["alpha", "zed"],
      kept: [],
      skipped: ["broken", "odd"],
    });
    expect(readFileSync(notJson, "utf8")).toBe(broken);
    expect(readFileSync(odd, "utf8")).toBe(unwalkable);
    expect(readLayout(alpha)).toEqual(withoutSlots(layout(), "hello").node);
    expect(readLayout(zed)).toEqual(withoutSlots(layout(), "hello").node);
  });
});

describe("ensureSlot", () => {
  const bare = (): LayoutNode => withoutSlots(layout(), "hello").node;
  const showing = (name: string) => (): HerdrStatus => ({
    _tag: "Running",
    text: json({ layout: name, errors: [] }),
  });

  test("says herdr-app isn't installed when it isn't on PATH, and writes nothing", () => {
    const home = tempDir();
    const content = json(bare());
    const work = writeFile(home, "layouts/work.json", content);

    expect(ensureSlot("hello", {}, { home, status: () => ({ _tag: "NotInstalled" }) })).toBe(
      "herdr-slots: herdr-app not found on PATH; install the Herdr app to see hello.",
    );
    expect(readFileSync(work, "utf8")).toBe(content);
  });

  test("says Herdr isn't running when herdr-app status fails, and writes nothing", () => {
    const home = tempDir();
    const content = json(bare());
    const work = writeFile(home, "layouts/work.json", content);

    expect(ensureSlot("hello", {}, { home, status: () => ({ _tag: "NotRunning" }) })).toBe(
      "herdr-slots: Herdr isn't running; open it to see hello.",
    );
    expect(readFileSync(work, "utf8")).toBe(content);
  });

  test("says Herdr isn't running when the status names no layout, and writes nothing", () => {
    const home = tempDir();
    const content = json(bare());
    const work = writeFile(home, "layouts/work.json", content);

    expect(
      ensureSlot("hello", {}, { home, status: () => ({ _tag: "Running", text: "not json" }) }),
    ).toBe("herdr-slots: Herdr isn't running; open it to see hello.");
    expect(readFileSync(work, "utf8")).toBe(content);
  });

  test("won't add a slot to a layout that ships with Herdr", () => {
    const home = tempDir();
    writeFile(home, "installed.json", json({ "layout:work": {} }));
    const content = json(bare());
    const work = writeFile(home, "layouts/work.json", content);

    expect(ensureSlot("hello", {}, { home, status: showing("work") })).toBe(
      'herdr-slots: "work" ships with Herdr and can\'t take new slots; clone it, or add hello by hand.',
    );
    expect(readFileSync(work, "utf8")).toBe(content);
  });

  test("says so when the shown layout has no file", () => {
    const home = tempDir();

    expect(ensureSlot("hello", {}, { home, status: showing("work") })).toBe(
      'herdr-slots: no file for layout "work"; add hello by hand.',
    );
  });

  test("leaves a layout that already has the slot unchanged", () => {
    const home = tempDir();
    const content = json(layout());
    const work = writeFile(home, "layouts/work.json", content);
    const mtime = age(work);

    expect(ensureSlot("hello", {}, { home, status: showing("work") })).toBe(
      'herdr-slots: hello already has a slot in "work".',
    );
    expect(readFileSync(work, "utf8")).toBe(content);
    expect(statSync(work).mtimeMs).toBe(mtime);
  });

  test("won't guess at a place it can't dock", () => {
    const home = tempDir();
    const content = json(bare());
    const work = writeFile(home, "layouts/work.json", content);

    expect(ensureSlot("hello", { place: "top" }, { home, status: showing("work") })).toBe(
      'herdr-slots: can\'t dock hello at "top" automatically; add it to "work" by hand.',
    );
    expect(readFileSync(work, "utf8")).toBe(content);
  });

  test("names the default place, right, when it can't dock in a root that isn't a row", () => {
    const home = tempDir();
    const content = json({ ...bare(), type: "column" });
    const work = writeFile(home, "layouts/work.json", content);

    expect(ensureSlot("hello", {}, { home, status: showing("work") })).toBe(
      'herdr-slots: can\'t dock hello at "right" automatically; add it to "work" by hand.',
    );
    expect(readFileSync(work, "utf8")).toBe(content);
  });

  test("adds the slot on the right by default, sized from mod.json", () => {
    const home = tempDir();
    const work = writeFile(home, "layouts/work.json", json(bare()));

    expect(ensureSlot("hello", { size: 240 }, { home, status: showing("work") })).toBe(
      'herdr-slots: added hello to "work" (right).',
    );
    const children = childrenOf(readLayout(work));
    expect(children).toHaveLength(3);
    expect(children.at(-1)).toMatchObject({
      type: "block",
      content: { mod: "hello" },
      size: { px: 240 },
    });
  });

  test("adds the slot on the left when mod.json asks", () => {
    const home = tempDir();
    const work = writeFile(home, "layouts/work.json", json(bare()));

    expect(ensureSlot("hello", { place: "left" }, { home, status: showing("work") })).toBe(
      'herdr-slots: added hello to "work" (left).',
    );
    const children = childrenOf(readLayout(work));
    expect(children).toHaveLength(3);
    expect(children[0]).toMatchObject({ type: "block", content: { mod: "hello" } });
    expect(children[0]).not.toHaveProperty("size");
  });
});

describe("ensureSlot, with herdr-app from PATH", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const bare = (): LayoutNode => withoutSlots(layout(), "hello").node;

  /** Puts a folder first on PATH holding a `herdr-app` that runs `body`, or none when undefined. */
  const herdrApp = (body: string | undefined): void => {
    const bin = join(tempDir(), "bin");
    if (body !== undefined) fakeBin(bin, "herdr-app", body);
    vi.stubEnv("PATH", body === undefined ? bin : `${bin}:${process.env.PATH ?? ""}`);
  };

  test("reads the shown layout from herdr-app status and adds the slot", () => {
    const home = tempDir();
    const work = writeFile(home, "layouts/work.json", json(bare()));
    herdrApp(`[ "$1" = status ] && echo '{"layout":"work","errors":[]}'`);

    expect(ensureSlot("hello", {}, { home })).toBe('herdr-slots: added hello to "work" (right).');
    expect(hasSlot(readLayout(work), "hello")).toBe(true);
  });

  test("says Herdr isn't running when herdr-app status exits non-zero", () => {
    const home = tempDir();
    herdrApp("exit 1");

    expect(ensureSlot("hello", {}, { home })).toBe(
      "herdr-slots: Herdr isn't running; open it to see hello.",
    );
  });

  test("says herdr-app isn't installed when it isn't on PATH", () => {
    const home = tempDir();
    herdrApp(undefined);

    expect(ensureSlot("hello", {}, { home })).toBe(
      "herdr-slots: herdr-app not found on PATH; install the Herdr app to see hello.",
    );
  });
});

describe("herdrHome", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("uses HERDR_APP_HOME when it is set", () => {
    vi.stubEnv("HERDR_APP_HOME", "/elsewhere/herdr");
    expect(herdrHome()).toBe("/elsewhere/herdr");
  });

  test("falls back to .config/herdr-app in the home folder", () => {
    vi.stubEnv("HERDR_APP_HOME", undefined);
    expect(herdrHome()).toBe(join(homedir(), ".config", "herdr-app"));
  });
});
