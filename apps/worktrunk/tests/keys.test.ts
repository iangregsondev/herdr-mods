import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  actionFor,
  copiesIn,
  handledAtStart,
  isLeftover,
  noticeFor,
  routeCommand,
} from "../src/keys.ts";

const shownPanel = { panel: Option.some({ id: "p", hidden: false }), toggleShown: true };
const hiddenPanel = { panel: Option.some({ id: "p", hidden: true }), toggleShown: true };
const noPanel = { panel: Option.none(), toggleShown: true };

describe("routeCommand", () => {
  test.each(["refresh", "new", "settings", "focus"])(
    "the shown panel runs %s itself",
    (command) => {
      expect(routeCommand(command, "panel", shownPanel)).toEqual({ _tag: "Run", command });
    },
  );

  test.each(["refresh", "new", "settings", "focus"])(
    "the toggle copy leaves %s to the shown panel",
    (command) => {
      expect(routeCommand(command, "toggle", shownPanel)).toEqual({ _tag: "Ignore" });
    },
  );

  test("with the panel hidden, the toggle copy shows it and hands the command on", () => {
    expect(routeCommand("settings", "toggle", hiddenPanel)).toEqual({
      _tag: "ShowThen",
      id: "p",
      command: "settings",
    });
  });

  test("the toggle copy flips the panel on toggle, shown or hidden", () => {
    expect(routeCommand("toggle", "toggle", shownPanel)).toEqual({ _tag: "Toggle", id: "p" });
    expect(routeCommand("toggle", "toggle", hiddenPanel)).toEqual({ _tag: "Toggle", id: "p" });
  });

  test("the panel leaves toggle to the shown toggle copy, so it flips once", () => {
    expect(routeCommand("toggle", "panel", shownPanel)).toEqual({ _tag: "Ignore" });
  });

  test("in a layout with no shown toggle copy, the panel hides itself on toggle", () => {
    const docked = { panel: Option.some({ id: "b9", hidden: false }), toggleShown: false };
    expect(routeCommand("toggle", "panel", docked)).toEqual({ _tag: "Toggle", id: "b9" });
  });

  test("a panel with no block of its own to toggle leaves toggle alone", () => {
    const blockless = { panel: Option.none(), toggleShown: false };
    expect(routeCommand("toggle", "panel", blockless)).toEqual({ _tag: "Ignore" });
  });

  test("the toggle copy says so when the layout has no panel to toggle", () => {
    expect(routeCommand("toggle", "toggle", noPanel)).toEqual({ _tag: "NoPanel" });
  });

  test("the toggle copy says so when the layout has no panel to hand a command to", () => {
    expect(routeCommand("refresh", "toggle", noPanel)).toEqual({ _tag: "NoPanel" });
  });

  test("the shown panel reports a command it doesn't know", () => {
    expect(routeCommand("bogus", "panel", shownPanel)).toEqual({
      _tag: "Unknown",
      command: "bogus",
    });
  });

  test("the toggle copy leaves an unknown command to the shown panel, so it's reported once", () => {
    expect(routeCommand("bogus", "toggle", shownPanel)).toEqual({ _tag: "Ignore" });
  });

  test("with the panel hidden, the toggle copy reports a command it doesn't know", () => {
    expect(routeCommand("bogus", "toggle", hiddenPanel)).toEqual({
      _tag: "Unknown",
      command: "bogus",
    });
  });

  test.each(["menu", "confirm", "new", "settings", "titlebar"] as const)(
    "a %s overlay never acts on a command",
    (role) => {
      for (const command of ["toggle", "refresh", "bogus"]) {
        expect(routeCommand(command, role, hiddenPanel)).toEqual({ _tag: "Ignore" });
        expect(routeCommand(command, role, noPanel)).toEqual({ _tag: "Ignore" });
      }
    },
  );
});

describe("actionFor", () => {
  test.each([
    ["refresh", { _tag: "Refresh" }],
    ["settings", { _tag: "Settings" }],
    ["new", { _tag: "NewOrOpen", folder: null }],
    ["focus", { _tag: "Focus" }],
  ] as const)("%s runs the panel's %o", (command, action) => {
    expect(actionFor(command)).toEqual(action);
  });
});

describe("copiesIn", () => {
  const MOD = "iangregsondev-worktrunk";
  const toggle = (hidden: boolean) => ({
    id: "bar",
    hidden,
    children: [{ id: "t", content: { mod: MOD, props: { role: "toggle" } } }],
  });

  test("the panel's block, and a toggle copy that shows", () => {
    const tree = { children: [toggle(false), { id: "side", content: { mod: MOD } }] };
    expect(copiesIn(tree, MOD)).toEqual({
      panel: Option.some({ id: "side", hidden: false }),
      toggleShown: true,
    });
  });

  test("a toggle copy in a hidden part of the layout doesn't show", () => {
    const tree = { children: [toggle(true), { id: "side", content: { mod: MOD } }] };
    expect(copiesIn(tree, MOD).toggleShown).toBe(false);
  });

  test("a layout without the mod has no panel and no toggle copy", () => {
    const tree = { children: [{ id: "term", content: { terminal: "t1" } }] };
    expect(copiesIn(tree, MOD)).toEqual({ panel: Option.none(), toggleShown: false });
  });
});

describe("isLeftover", () => {
  test("a request posted more than 5 seconds ago is left over from an earlier run", () => {
    expect(isLeftover(54_999, 60_000)).toBe(true);
  });

  test("a request at most 5 seconds old is fresh", () => {
    expect(isLeftover(55_000, 60_000)).toBe(false);
    expect(isLeftover(58_000, 60_000)).toBe(false);
  });
});

describe("handledAtStart", () => {
  const request = (id: number) => Option.some({ id, action: { _tag: "Refresh" } as const });

  test("a request left over from an earlier run counts as handled, so it never runs", () => {
    expect(handledAtStart(request(1_000.5), 60_000)).toEqual(Option.some(1_000.5));
  });

  test("a fresh request, the toggle copy handing on a command as it shows the panel, runs", () => {
    expect(handledAtStart(request(58_000.5), 60_000)).toEqual(Option.none());
  });

  test("an empty mailbox leaves nothing handled", () => {
    expect(handledAtStart(Option.none(), 60_000)).toEqual(Option.none());
  });
});

describe("noticeFor", () => {
  test("says the layout has no panel to show", () => {
    expect(noticeFor({ _tag: "NoPanel" })).toEqual(
      Option.some({
        title: "No worktrunk panel here",
        body: "This layout has no worktrunk panel block to show.",
      }),
    );
  });

  test("names an unknown command and the ones there are", () => {
    expect(noticeFor({ _tag: "Unknown", command: "bogus" })).toEqual(
      Option.some({
        title: "Unknown worktrunk command",
        body: '"bogus": use refresh, new, settings, focus or toggle.',
      }),
    );
  });

  test.each([
    { _tag: "Run", command: "refresh" },
    { _tag: "ShowThen", id: "p", command: "new" },
    { _tag: "Toggle", id: "p" },
    { _tag: "Ignore" },
  ] as const)("no notice for a $_tag step", (step) => {
    expect(noticeFor(step)).toEqual(Option.none());
  });
});
