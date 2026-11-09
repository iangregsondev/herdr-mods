import { readFileSync, statSync, utimesSync } from "node:fs";
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
  type LayoutNode,
} from "./herdr-slots.ts";
import { tempDir, writeFile } from "./test-support.ts";

const slot = (mod: string): LayoutNode => ({ id: `b-${mod}`, type: "block", content: { mod } });

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
    const next = withSlot(bare(), "hello", "right", 240)!;
    const last = next.children!.at(-1)!;
    expect(last).toMatchObject({ type: "block", content: { mod: "hello" }, size: { px: 240 } });
    expect(last.id).toMatch(/^b[0-9a-f]{32}$/);
    expect(next.children).toHaveLength(3);
  });

  test("left docks at the start", () => {
    const next = withSlot(bare(), "hello", "left", 240)!;
    expect(next.children![0].content).toEqual({ mod: "hello" });
  });

  test("leaves size out when mod.json has none", () => {
    const next = withSlot(bare(), "hello", "right", undefined)!;
    expect(next.children!.at(-1)).not.toHaveProperty("size");
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

const readLayout = (path: string): LayoutNode =>
  // The file was written by the code under test from a LayoutNode; the assertions check its shape.
  JSON.parse(readFileSync(path, "utf8")) as LayoutNode;

/** Sets a file's mtime well in the past, so any rewrite shows as a newer mtime. */
const age = (path: string): number => {
  const past = new Date("2020-01-01T00:00:00Z");
  utimesSync(path, past, past);
  return statSync(path).mtimeMs;
};

describe("removeSlots", () => {
  test("is empty when there is no layouts folder", () => {
    expect(removeSlots("hello", tempDir())).toEqual([]);
  });

  test("removes the mod's slots from the person's layouts and names them", () => {
    const home = tempDir();
    const work = writeFile(home, "layouts/work.json", json(layout()));
    const play = writeFile(home, "layouts/play.json", json(layout()));

    expect(removeSlots("hello", home).sort()).toEqual(["play", "work"]);
    expect(readLayout(work)).toEqual(withoutSlots(layout(), "hello").node);
    expect(readLayout(play)).toEqual(withoutSlots(layout(), "hello").node);
  });

  test("leaves layouts that ship with Herdr alone", () => {
    const home = tempDir();
    writeFile(home, "installed.json", json({ "layout:shipped": {}, "mod:hello": {} }));
    const shipped = writeFile(home, "layouts/shipped.json", json(layout()));
    const mine = writeFile(home, "layouts/mine.json", json(layout()));

    expect(removeSlots("hello", home)).toEqual(["mine"]);
    expect(readFileSync(shipped, "utf8")).toBe(json(layout()));
    expect(hasSlot(readLayout(mine), "hello")).toBe(false);
  });

  test("skips files that aren't .json", () => {
    const home = tempDir();
    const backup = writeFile(home, "layouts/work.json.bak", json(layout()));

    expect(removeSlots("hello", home)).toEqual([]);
    expect(readFileSync(backup, "utf8")).toBe(json(layout()));
  });

  test("doesn't rewrite a layout with no slot for the mod", () => {
    const home = tempDir();
    const content = json(layout());
    const work = writeFile(home, "layouts/work.json", content);
    const mtime = age(work);

    expect(removeSlots("other", home)).toEqual([]);
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

    expect(removeSlots("hello", home)).toEqual(["work"]);
  });
});

describe("ensureSlot", () => {
  const bare = (): LayoutNode => withoutSlots(layout(), "hello").node;
  const showing = (name: string) => () => json({ layout: name, errors: [] });

  test("says Herdr isn't running when there is no status, and writes nothing", () => {
    const home = tempDir();
    const content = json(bare());
    const work = writeFile(home, "layouts/work.json", content);

    expect(ensureSlot("hello", {}, { home, status: () => null })).toBe(
      "herdr-slots: Herdr isn't running; open it to see hello.",
    );
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

  test("adds the slot on the right by default, sized from mod.json", () => {
    const home = tempDir();
    const work = writeFile(home, "layouts/work.json", json(bare()));

    expect(ensureSlot("hello", { size: 240 }, { home, status: showing("work") })).toBe(
      'herdr-slots: added hello to "work" (right).',
    );
    const written = readLayout(work);
    expect(written.children).toHaveLength(3);
    expect(written.children!.at(-1)).toMatchObject({
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
    const written = readLayout(work);
    expect(written.children).toHaveLength(3);
    expect(written.children![0]).toMatchObject({ type: "block", content: { mod: "hello" } });
    expect(written.children![0]).not.toHaveProperty("size");
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
