import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import menuStandIn from "./fixtures/menu.js?raw";
import newMenuStandIn from "./fixtures/new-menu.js?raw";
import spacesStandIn from "./fixtures/spaces.js?raw";
import tabsStandIn from "./fixtures/tabs.js?raw";
import { withWorktrunkItems } from "../src/items.ts";
import {
  NEW_MENU_HEIGHT,
  ROLES,
  ROW,
  SPACE_MENU_HEIGHT,
  patchedSource,
  roleIn,
  wrapFor,
  type Role,
} from "../src/wraps.ts";

const SELF = "iangregsondev-menus";

describe("roleIn", () => {
  test("a copy's role comes from its props", () => {
    expect(roleIn({ role: "spaces" })).toEqual(Option.some("spaces"));
    expect(roleIn({ role: "menu", tab: "space" })).toEqual(Option.some("menu"));
  });

  test("a role that isn't ours, or no props, is none", () => {
    expect(roleIn({ role: "panel" })).toEqual(Option.none());
    expect(roleIn(undefined)).toEqual(Option.none());
  });
});

describe("wrapFor", () => {
  test("each role wraps the Herdr mod of the same name", () => {
    expect(ROLES.map((role) => wrapFor(role, SELF).mod)).toEqual([
      "tabs",
      "spaces",
      "new-menu",
      "menu",
    ]);
  });
});

/** How many stand-ins have been loaded, so each load is a module of its own. */
const loads = { count: 0 };

/**
 * Runs a patched stand-in as a module, as Herdr runs the copy in our folder. The same
 * text would give back the module loaded before (an extension set and all), so each
 * load gets a comment of its own.
 */
// The stand-ins are plain JS: their exports are whatever the test reads.
const load = async (text: string): Promise<Record<string, (...args: unknown[]) => unknown>> => {
  loads.count += 1;
  const source = `${text}\n// load ${loads.count}`;
  return import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`);
};

const patched = (role: Role, source: string): string =>
  Result.getOrThrow(patchedSource(wrapFor(role, SELF), source));

describe("the tab bar's copy", () => {
  test('"+" opens our new-menu, tall enough for our item', async () => {
    const tabs = await load(patched("tabs", tabsStandIn));
    expect(tabs.plus()).toEqual({
      mod: SELF,
      kind: "popup",
      width: 250,
      height: NEW_MENU_HEIGHT,
      props: { role: "new-menu" },
    });
    expect(NEW_MENU_HEIGHT).toBeGreaterThan(512);
  });

  test("a tab's right-click still opens Herdr's own menu", async () => {
    const tabs = await load(patched("tabs", tabsStandIn));
    expect(tabs.tabMenu("t1", "sp1")).toMatchObject({ mod: "menu", props: { tab: "tab" } });
  });
});

describe("the sidebar's copy", () => {
  test("a space's right-click opens our menu, with Herdr's props and room for our items", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    expect(spaces.spaceMenu({ id: "sp1" })).toEqual({
      mod: SELF,
      kind: "popup",
      width: 200,
      height: SPACE_MENU_HEIGHT,
      props: { role: "menu", tab: "space", target: { id: "sp1" } },
    });
    expect(SPACE_MENU_HEIGHT).toBeGreaterThanOrEqual(260 + 3 * 31);
  });
});

/** Every text an element from a stand-in draws, in order. */
const texts = (el: unknown): readonly string[] =>
  typeof el === "string"
    ? [el]
    : ((el as { kids?: readonly unknown[] } | undefined)?.kids ?? []).flatMap(texts);

describe("the sidebar's space rows", () => {
  const T = { foreground: "#ffffff", dim: "#888888", raised: "#222222" };

  test("a space's row shows its group label after its name", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    spaces.__wtSetLabelOf((w: { id: string }) => (w.id === "sp1" ? "Work" : null));
    expect(texts(spaces.row({ id: "sp1", name: "app" }, T))).toEqual(["app", "Work"]);
  });

  test("a space with no group, or a copy whose labels aren't set, shows only its name", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    expect(texts(spaces.row({ id: "sp1", name: "app" }, T))).toEqual(["app"]);
    spaces.__wtSetLabelOf(() => null);
    expect(texts(spaces.row({ id: "sp2", name: "lib" }, T))).toEqual(["lib"]);
  });
});

describe('the "+" menu\'s copy', () => {
  test("its menu is one row taller than Herdr's, so our row takes no room from the agents", async () => {
    const menu = await load(patched("new-menu", newMenuStandIn));
    expect(menu.root(["a", "b"])).toBe(167 + 2 * 31 + ROW);
    expect(menu.root(Array.from({ length: 20 }, String))).toBe(491 + ROW);
    expect(491 + ROW).toBeLessThanOrEqual(NEW_MENU_HEIGHT);
  });
});

describe("the menu's copy", () => {
  test("its item list, as Herdr's choose reads it, includes ours after Herdr's worktree items", async () => {
    const menu = await load(patched("menu", menuStandIn));
    menu.__wtSetExtend(withWorktrunkItems);
    // The stand-in's class: a `choose(i)` that returns the item list's entry.
    const Menu = menu.default as unknown as new () => {
      p: unknown;
      git: unknown;
      choose(i: number): unknown;
    };
    const copy = Object.assign(new Menu(), {
      p: { tab: "space", target: { id: "sp1" } },
      git: "linked",
    });
    expect([0, 1, 2, 3, 4, 5].map((i) => (copy.choose(i) as unknown[] | undefined)?.[0])).toEqual([
      "Rename",
      "New worktree",
      "Worktree (wt)…",
      "Merge into main (wt)…",
      "Remove worktree (wt)…",
      "Close",
    ]);
  });

  test("exports the list for our wrapper, and is Herdr's list until an extension is set", async () => {
    const menu = await load(patched("menu", menuStandIn));
    expect(menu.__wtItems({ tab: "space", target: { id: "sp1" } }, "linked")).toEqual([
      ["Rename", "space.rename", { id: "sp1" }],
      ["New worktree", "worktree", { space: "sp1", action: "new" }],
      ["Close", "space.close", { id: "sp1" }],
    ]);
  });
});

describe("patch points that no longer fit", () => {
  const missed = (role: Role, source: string) =>
    Result.match(patchedSource(wrapFor(role, SELF), source), {
      onSuccess: () => [],
      onFailure: (misses) => misses,
    });

  test("a Herdr menu whose height changed shape is a miss, named", () => {
    expect(missed("new-menu", "v_flex().h(400)")).toEqual([
      { name: "new-menu: menu height", found: 0 },
    ]);
  });

  test('a tab bar whose "+" call moved is a miss, named', () => {
    const moved = tabsStandIn.replace("height: 512", "height: 520");
    expect(missed("tabs", moved)).toEqual([{ name: 'tabs: "+" button opens new-menu', found: 0 }]);
  });

  test("a sidebar with the space menu call twice is a miss, with its count", () => {
    const call =
      'openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space",';
    const twice = spacesStandIn.replace(call, `${call} again: ${call}`);
    expect(missed("spaces", twice)).toEqual([
      { name: "spaces: space right-click opens menu", found: 2 },
    ]);
  });

  test("a sidebar whose space row changed shape is a miss, named, so it gets no labels", () => {
    const moved = spacesStandIn.replace("max_w(150)", "max_w(180)");
    expect(missed("spaces", moved)).toEqual([{ name: "spaces: space row's name", found: 0 }]);
  });

  test("a menu whose item list was renamed is a miss, named", () => {
    expect(missed("menu", "function list(p, git) {}")).toEqual([
      { name: "menu: items(p, git) list", found: 0 },
    ]);
  });
});
