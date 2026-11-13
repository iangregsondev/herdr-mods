import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { newMenuAnchor, requestOf, withWorktrunkItems, type Item } from "../src/items.ts";

const SPACE = { tab: "space", target: { id: "sp1" } };

/** Herdr's space menu as its `items(p, git)` builds it, with made-up labels. */
const herdrSpaceItems = (git: string | null): Item[] => [
  ["Rename", "space.rename", { id: "sp1" }],
  ...(git
    ? ([
        ["New worktree", "worktree", { space: "sp1", action: "new" }],
        ["Open worktree", "worktree", { space: "sp1", action: "open" }],
      ] as const)
    : []),
  ...(git === "linked"
    ? ([["Remove worktree", "worktree", { space: "sp1", action: "remove" }]] as const)
    : []),
  ["Close", "space.close", { id: "sp1" }],
];

const labels = (list: readonly Item[]) => list.map((item) => item[0]);

describe("withWorktrunkItems", () => {
  test("a space on a linked worktree: all four ours, just after Herdr's worktree items", () => {
    expect(labels(withWorktrunkItems(herdrSpaceItems("linked"), SPACE, "linked"))).toEqual([
      "Rename",
      "New worktree",
      "Open worktree",
      "Remove worktree",
      "New worktree (wt)…",
      "Open worktree (wt)…",
      "Merge into main (wt)…",
      "Remove worktree (wt)…",
      "Close",
    ]);
  });

  test("a space on a repo's main checkout: only New and Open worktree (wt)…", () => {
    expect(labels(withWorktrunkItems(herdrSpaceItems("main"), SPACE, "main"))).toEqual([
      "Rename",
      "New worktree",
      "Open worktree",
      "New worktree (wt)…",
      "Open worktree (wt)…",
      "Close",
    ]);
  });

  test("a space outside git, or not checked yet: Herdr's items alone", () => {
    expect(withWorktrunkItems(herdrSpaceItems(null), SPACE, null)).toEqual(herdrSpaceItems(null));
  });

  test("with no Herdr worktree items to follow, ours go before Close", () => {
    const plain: Item[] = [
      ["Rename", "space.rename", { id: "sp1" }],
      ["Close", "space.close", { id: "sp1" }],
    ];
    expect(labels(withWorktrunkItems(plain, SPACE, "main"))).toEqual([
      "Rename",
      "New worktree (wt)…",
      "Open worktree (wt)…",
      "Close",
    ]);
  });

  test("with neither worktree items nor Close, ours go last", () => {
    const bare: Item[] = [["Rename", "space.rename", { id: "sp1" }]];
    expect(labels(withWorktrunkItems(bare, SPACE, "main"))).toEqual([
      "Rename",
      "New worktree (wt)…",
      "Open worktree (wt)…",
    ]);
  });

  test("menus for tabs, panes and the window are left alone", () => {
    const tab: Item[] = [["Close", "tab.close", { id: "t1" }]];
    expect(withWorktrunkItems(tab, { tab: "tab", target: { id: "t1" } }, "linked")).toEqual(tab);
    expect(withWorktrunkItems(tab, undefined, "linked")).toEqual(tab);
  });

  test("keeps every Herdr item, including ones it adds later, in Herdr's order", () => {
    const later: Item[] = [
      ["Pin", "space.pin", { id: "sp1" }],
      ...herdrSpaceItems("linked"),
      ["Archive", "space.archive", { id: "sp1" }],
    ];
    const out = withWorktrunkItems(later, SPACE, "linked");
    expect(out.filter((item) => !item[0].endsWith("(wt)…"))).toEqual(later);
  });

  test("ours use Herdr's worktree command, so they get its branch icon", () => {
    const ours = withWorktrunkItems(herdrSpaceItems("linked"), SPACE, "linked").filter((item) =>
      item[0].endsWith("(wt)…"),
    );
    expect(ours.map((item) => item[1])).toEqual(["worktree", "worktree", "worktree", "worktree"]);
  });
});

describe("requestOf", () => {
  const ours = (git: string) =>
    withWorktrunkItems(herdrSpaceItems(git), SPACE, git).filter((item) =>
      item[0].endsWith("(wt)…"),
    );

  test("each of our items asks the worktrunk panel to act on its space", () => {
    expect(ours("linked").map(requestOf)).toEqual([
      Option.some({ _tag: "SpaceWorktree", space: "sp1", act: "NewOrOpen" }),
      Option.some({ _tag: "SpaceWorktree", space: "sp1", act: "Open" }),
      Option.some({ _tag: "SpaceWorktree", space: "sp1", act: "Merge" }),
      Option.some({ _tag: "SpaceWorktree", space: "sp1", act: "Remove" }),
    ]);
  });
});

describe("requestOf, for anything not ours", () => {
  test("Herdr's own items, and nothing at all, are none", () => {
    expect(herdrSpaceItems("linked").map(requestOf)).toEqual(
      herdrSpaceItems("linked").map(() => Option.none()),
    );
    expect(requestOf(undefined)).toEqual(Option.none());
  });

  test("an item marked with an act the panel doesn't know is none", () => {
    expect(requestOf(["Push (wt)…", "worktree", { space: "sp1", worktrunk: "Push" }])).toEqual(
      Option.none(),
    );
  });
});

describe("newMenuAnchor", () => {
  const herdrRows = [
    { id: "terminal", name: "Terminal" },
    { id: "claude", name: "Claude Code" },
    { id: "space", name: "New space" },
    { id: "worktree", name: "New worktree…" },
    { id: "worktree-open", name: "Open worktree…" },
  ];

  test("ours goes just after Herdr's last worktree row", () => {
    expect(newMenuAnchor(herdrRows)).toEqual(Option.some("worktree-open"));
  });

  test("rows Herdr adds after its worktree rows stay after ours", () => {
    expect(newMenuAnchor([...herdrRows, { id: "settings", name: "Settings…" }])).toEqual(
      Option.some("worktree-open"),
    );
  });

  test("a worktree row is found by its label when its id changes", () => {
    expect(
      newMenuAnchor([
        { id: "space", name: "New space" },
        { id: "wt-new", name: "New Worktree…" },
        { id: "settings", name: "Settings…" },
      ]),
    ).toEqual(Option.some("wt-new"));
  });

  test("with no worktree row, there is nothing to follow", () => {
    expect(newMenuAnchor([{ id: "terminal", name: "Terminal" }])).toEqual(Option.none());
    expect(newMenuAnchor([])).toEqual(Option.none());
  });
});
