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
  test("a space's right-click opens our menu, with Herdr's props and room for our four items", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    expect(spaces.spaceMenu({ id: "sp1" })).toEqual({
      mod: SELF,
      kind: "popup",
      width: 200,
      height: SPACE_MENU_HEIGHT,
      props: { role: "menu", tab: "space", target: { id: "sp1" } },
    });
    expect(SPACE_MENU_HEIGHT).toBeGreaterThanOrEqual(260 + 4 * 31);
  });
});

/** Every text an element from a stand-in draws, in order. */
const texts = (el: unknown): readonly string[] =>
  typeof el === "string"
    ? [el]
    : ((el as { kids?: readonly unknown[] } | undefined)?.kids ?? []).flatMap(texts);

/** The elements a stand-in element holds, in order. */
const kidsOf = (el: unknown): readonly unknown[] =>
  (el as { kids?: readonly unknown[] } | undefined)?.kids ?? [];

/** The text colour a stand-in element was given, if any. */
const colorOf = (el: unknown): unknown => (el as { color?: unknown } | undefined)?.color;

describe("the sidebar's space rows", () => {
  const T = { foreground: "#ffffff", dim: "#888888", raised: "#222222", ansi3: "#ffff00" };
  const WORK = { label: "Work", color: "dim" };
  const OTHER = { label: "Other", color: "ansi3" };
  const look = {
    pillsOf: (w: { id: string }) => (w.id === "sp1" ? [WORK, OTHER] : []),
    nameColorOf: () => "foreground",
  };

  test("a space's row shows its pills after its name, in order", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    spaces.__wtSetLook(look);
    expect(texts(spaces.row({ id: "sp1", name: "app" }, T))).toEqual(["app", "Work", "Other"]);
  });

  test("each pill's text is drawn in its own theme colour", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    spaces.__wtSetLook(look);
    const pills = kidsOf(spaces.row({ id: "sp1", name: "app" }, T)).slice(1, 3);
    expect(pills.map(colorOf)).toEqual([T.dim, T.ansi3]);
  });

  test("a space's name is drawn in the theme colour its look gives, foreground until set", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    const name = (id: string) => colorOf(kidsOf(spaces.row({ id, name: "app" }, T))[0]);
    expect(name("sp1")).toBe(T.foreground);
    spaces.__wtSetLook({
      ...look,
      nameColorOf: (w: { id: string }) => (w.id === "sp1" ? "dim" : "foreground"),
    });
    expect([name("sp1"), name("sp2")]).toEqual([T.dim, T.foreground]);
  });

  test("a space with no pills, or a copy whose look isn't set, shows only its name", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    expect(texts(spaces.row({ id: "sp1", name: "app" }, T))).toEqual(["app"]);
    spaces.__wtSetLook(look);
    expect(texts(spaces.row({ id: "sp2", name: "lib" }, T))).toEqual(["lib"]);
  });
});

describe("the sidebar's ordering", () => {
  const ORPHAN_GIT = { name: "api", branch: "feat/9-x", repo: "orphan", linked: true };
  const HERDR_GIT = { name: "api", branch: "main", repo: "herdr", linked: false };
  // The stand-in's class: Herdr's sidebar, made with its git entries, and its row list.
  type Sidebar = new (git: Record<string, unknown>) => {
    rows(sp: readonly unknown[], ps: readonly unknown[]): readonly { g: unknown }[];
  };

  test("a space git has no entry for gets the entry its look gives; a space git answered for keeps Herdr's", async () => {
    const spaces = await load(patched("spaces", spacesStandIn));
    spaces.__wtSetLook({
      nameColorOf: () => "foreground",
      pillsOf: () => [],
      gitOf: (w: { id: string }) => (w.id === "sp3" ? null : ORPHAN_GIT),
    });
    // The stand-in exports its sidebar class beside its functions.
    const Herdr = spaces.Sidebar as unknown as Sidebar;
    const sidebar = new Herdr({ [JSON.stringify([null, "/r/api"])]: HERDR_GIT });
    const sp = [
      { id: "sp1", folder: "/r/api.feat" },
      { id: "sp2", folder: "/r/api" },
      { id: "sp3", folder: "/tmp" },
    ];
    expect(sidebar.rows(sp, []).map((row) => row.g)).toEqual([ORPHAN_GIT, HERDR_GIT, null]);
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
    expect(
      [0, 1, 2, 3, 4, 5, 6].map((i) => (copy.choose(i) as unknown[] | undefined)?.[0]),
    ).toEqual([
      "Rename",
      "New worktree",
      "New worktree (wt)…",
      "Open worktree (wt)…",
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

  test("every sidebar patch point is found exactly once in Herdr's sidebar", () => {
    expect(missed("spaces", spacesStandIn)).toEqual([]);
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

  test("a sidebar whose space row changed shape is a miss, named, so it gets no pills", () => {
    const moved = spacesStandIn.replace("min_w(SIDE_MIN)", "min_w(64)");
    expect(missed("spaces", moved)).toEqual([{ name: "spaces: space row's name", found: 0 }]);
  });

  test("a sidebar whose ordering's row list changed shape is a miss, named, so it nests nothing", () => {
    const moved = spacesStandIn.replace("?? null }));", "|| null }));");
    expect(missed("spaces", moved)).toEqual([{ name: "spaces: ordering's git entries", found: 0 }]);
  });

  test("a menu whose item list was renamed is a miss, named", () => {
    expect(missed("menu", "function list(p, git) {}")).toEqual([
      { name: "menu: items(p, git) list", found: 0 },
    ]);
  });
});
