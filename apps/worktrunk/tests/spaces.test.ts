import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  focusedFolder,
  localPlaces,
  placeOf,
  spacesInGone,
  spacesOnWorktrees,
  type PaneLike,
  type SpaceLike,
} from "../src/spaces.ts";

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

describe("spacesInGone", () => {
  test("the spaces whose place is in a gone folder or below it", () => {
    const spaces = [
      space("s1", "/elsewhere", ["t1"]),
      space("s2", "/r/app", ["t2"]),
      space("s3", "/r/app.feat-xy", ["t3"]),
      space("s4", "/r/app.feat-x", ["t4"]),
    ];
    const panes = [pane("t1", "/r/app.feat-x/src"), pane("t4", "/r/app.feat-x")];
    expect(spacesInGone(spaces, panes, ["/r/app.feat-x"])).toEqual(["s1", "s4"]);
  });

  test("a space made in a removed worktree closes though its terminal followed the folder elsewhere", () => {
    // wt moves a removed worktree into a trash folder, and the shell inside goes with it.
    const spaces = [space("s1", "/r/app.feat-x", ["t1"])];
    const panes = [pane("t1", "/r/app/.git/wt/trash/app.feat-x-123")];
    expect(spacesInGone(spaces, panes, ["/r/app.feat-x"])).toEqual(["s1"]);
  });

  test("spaces on other machines are never closed", () => {
    const remote = space("s1", "/r/app.feat-x", ["t1"], { machine: "box" });
    expect(spacesInGone([remote], [], ["/r/app.feat-x"])).toEqual([]);
  });

  test("nothing gone, nothing to close", () => {
    expect(spacesInGone([space("s1", "/r/app", ["t1"])], [], [])).toEqual([]);
  });
});

describe("focusedFolder", () => {
  const places = [
    { space: { id: "s1", active: true }, place: "/w/api.feature" },
    { space: { id: "s2", active: false }, place: "/p/web" },
  ];

  test("the focused terminal's live folder", () => {
    expect(focusedFolder({ space: "s1", cwd: "/w/api/src" }, places)).toEqual(
      Option.some("/w/api/src"),
    );
  });

  test("with no terminal focused (a mod pane or the panel), where the focused space is", () => {
    expect(focusedFolder({ space: "s2", cwd: null }, places)).toEqual(Option.some("/p/web"));
  });

  test("nothing focused, or a focused space with no place: none", () => {
    expect(focusedFolder(null, places)).toEqual(Option.none());
    expect(focusedFolder({ space: "remote/s9", cwd: null }, places)).toEqual(Option.none());
  });
});

describe("placeOf", () => {
  const places = localPlaces(
    [space("s1", "/r/app", ["t1"]), space("s2", "/r/app.feat", ["t2"])],
    [pane("t2", "/r/app.feat/src")],
  );

  test("where the space with that id is now", () => {
    expect(placeOf(places, "s2")).toEqual(Option.some("/r/app.feat/src"));
  });

  test("none for a space it doesn't know, such as one on another machine", () => {
    expect(placeOf(places, "vps/s9")).toEqual(Option.none());
  });
});
