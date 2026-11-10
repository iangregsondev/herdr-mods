import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { localPlaces, spacesOnWorktrees, type PaneLike, type SpaceLike } from "../src/spaces.ts";

const space = (
  id: string,
  folder: string,
  tabs: readonly string[],
  extra: Partial<SpaceLike> = {},
): SpaceLike => ({
  id,
  folder,
  machine: null,
  active: false,
  tabs: tabs.map((tab) => ({ id: tab })),
  ...extra,
});

const pane = (tab: string, cwd: string | null): PaneLike => ({ tab, cwd });

describe("localPlaces", () => {
  test("a space's place is its first pane's live folder", () => {
    const places = localPlaces(
      [space("s1", "/made/here", ["t1"])],
      [pane("t0", "/other/space"), pane("t1", null), pane("t1", "/now/here")],
    );
    expect(places).toEqual([{ space: { id: "s1", active: false }, place: "/now/here" }]);
  });

  test("else the folder it was made in", () => {
    expect(localPlaces([space("s1", "/made/here", ["t1"])], [])).toEqual([
      { space: { id: "s1", active: false }, place: "/made/here" },
    ]);
  });

  test("spaces on other machines are left out", () => {
    expect(localPlaces([space("s1", "/x", [], { machine: "vps" })], [])).toEqual([]);
  });

  test("a space with no folder and no live folder is left out", () => {
    expect(localPlaces([space("s2", "", ["t2"])], [pane("t2", null)])).toEqual([]);
  });
});

describe("spacesOnWorktrees", () => {
  const paths = ["/r", "/r.feature", "/r/nested-wt"];

  test("each space sits on the longest worktree path that contains its place", () => {
    const on = spacesOnWorktrees(
      [
        { space: { id: "a", active: false }, place: "/r/src" },
        { space: { id: "b", active: false }, place: "/r.feature" },
        { space: { id: "c", active: false }, place: "/r/nested-wt/lib" },
      ],
      paths,
    );
    expect(on.get("/r")?.id).toBe("a");
    expect(on.get("/r.feature")?.id).toBe("b");
    expect(on.get("/r/nested-wt")?.id).toBe("c");
  });

  test("a place outside every worktree matches none", () => {
    const on = spacesOnWorktrees([{ space: { id: "a", active: false }, place: "/rx" }], paths);
    expect([...on.keys()]).toEqual([]);
  });

  test("two spaces on one worktree: the shown one wins, else the first", () => {
    const first = { id: "a", active: false };
    const shown = { id: "b", active: true };
    const both = (second: { id: string; active: boolean }) =>
      spacesOnWorktrees(
        [
          { space: first, place: "/r" },
          { space: second, place: "/r" },
        ],
        paths,
      ).get("/r");
    expect(both(shown)).toEqual(shown);
    expect(Option.fromNullishOr(both({ id: "c", active: false }))).toEqual(Option.some(first));
  });
});
