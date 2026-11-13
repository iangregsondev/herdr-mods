import { Option } from "effect";
import { THIS_MACHINE } from "../src/machines.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  clickCommand,
  focusedFolder,
  goTo,
  spacePlaces,
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

describe("spacePlaces", () => {
  test("a space's place is its first pane's live folder", () => {
    const places = spacePlaces(
      [space("s1", "/made/here", ["t1"])],
      [pane("t0", "/other/space"), pane("t1", null), pane("t1", "/now/here")],
    );
    expect(places).toEqual([
      { space: { id: "s1", active: false }, machine: null, place: "/now/here" },
    ]);
  });

  test("else the folder it was made in", () => {
    expect(spacePlaces([space("s1", "/made/here", ["t1"])], [])).toEqual([
      { space: { id: "s1", active: false }, machine: null, place: "/made/here" },
    ]);
  });

  test("spaces on other machines are kept, each with its machine", () => {
    expect(spacePlaces([space("s1", "/x", [], { machine: "vps" })], [])).toEqual([
      { space: { id: "s1", active: false }, machine: "vps", place: "/x" },
    ]);
  });

  test("a space with no folder and no live folder is left out", () => {
    expect(spacePlaces([space("s2", "", ["t2"])], [pane("t2", null)])).toEqual([]);
  });
});

describe("spacesOnWorktrees", () => {
  const paths = ["/r", "/r.feature", "/r/nested-wt"];

  test("each space sits on the longest worktree path that contains its place", () => {
    const on = spacesOnWorktrees(
      [
        { space: { id: "a", active: false }, machine: null, place: "/r/src" },
        { space: { id: "b", active: false }, machine: null, place: "/r.feature" },
        { space: { id: "c", active: false }, machine: null, place: "/r/nested-wt/lib" },
      ],
      THIS_MACHINE,
      paths,
    );
    expect(on.get("/r")?.id).toBe("a");
    expect(on.get("/r.feature")?.id).toBe("b");
    expect(on.get("/r/nested-wt")?.id).toBe("c");
  });

  test("a place on another machine never matches, though its folder is the same", () => {
    const on = spacesOnWorktrees(
      [{ space: { id: "a", active: false }, machine: "vps", place: "/r" }],
      THIS_MACHINE,
      paths,
    );
    expect([...on.keys()]).toEqual([]);
  });

  test("a place on the worktrees' machine matches there", () => {
    const on = spacesOnWorktrees(
      [{ space: { id: "a", active: false }, machine: "vps", place: "/r/src" }],
      "vps",
      paths,
    );
    expect(on.get("/r")?.id).toBe("a");
  });

  test("a place outside every worktree matches none", () => {
    const on = spacesOnWorktrees(
      [{ space: { id: "a", active: false }, machine: null, place: "/rx" }],
      THIS_MACHINE,
      paths,
    );
    expect([...on.keys()]).toEqual([]);
  });

  test("two spaces on one worktree: the shown one wins, else the first", () => {
    const first = { id: "a", active: false };
    const shown = { id: "b", active: true };
    const both = (second: { id: string; active: boolean }) =>
      spacesOnWorktrees(
        [
          { space: first, machine: null, place: "/r" },
          { space: second, machine: null, place: "/r" },
        ],
        THIS_MACHINE,
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
    expect(spacesInGone(spaces, panes, THIS_MACHINE, ["/r/app.feat-x"])).toEqual(["s1", "s4"]);
  });

  test("a space made in a removed worktree closes though its terminal followed the folder elsewhere", () => {
    // wt moves a removed worktree into a trash folder, and the shell inside goes with it.
    const spaces = [space("s1", "/r/app.feat-x", ["t1"])];
    const panes = [pane("t1", "/r/app/.git/wt/trash/app.feat-x-123")];
    expect(spacesInGone(spaces, panes, THIS_MACHINE, ["/r/app.feat-x"])).toEqual(["s1"]);
  });

  test("the spaces on the gone folders' machine close; the same path on another machine stays", () => {
    const spaces = [
      space("box/s1", "/r/app.feat-x", ["box/t1"], { machine: "box" }),
      space("s2", "/r/app.feat-x", ["t2"]),
      space("other/s3", "/r/app.feat-x", ["other/t3"], { machine: "other" }),
    ];
    expect(spacesInGone(spaces, [], "box", ["/r/app.feat-x"])).toEqual(["box/s1"]);
  });

  test("nothing gone, nothing to close", () => {
    expect(spacesInGone([space("s1", "/r/app", ["t1"])], [], THIS_MACHINE, [])).toEqual([]);
  });
});

describe("focusedFolder", () => {
  const places = [
    { space: { id: "s1", active: true }, machine: null, place: "/w/api.feature" },
    { space: { id: "s2", active: false }, machine: null, place: "/p/web" },
    { space: { id: "linux/s3", active: false }, machine: "linux", place: "/srv/api" },
  ];

  test("the focused terminal's live folder", () => {
    expect(focusedFolder({ space: "s1", cwd: "/w/api/src" }, places)).toEqual(
      Option.some({ machine: null, folder: "/w/api/src" }),
    );
  });

  test("with no terminal focused (a mod pane or the panel), where the focused space is", () => {
    expect(focusedFolder({ space: "s2", cwd: null }, places)).toEqual(
      Option.some({ machine: null, folder: "/p/web" }),
    );
  });

  test("a folder in a space on another machine is on that machine", () => {
    expect(focusedFolder({ space: "linux/s3", cwd: "/srv/api/src" }, places)).toEqual(
      Option.some({ machine: "linux", folder: "/srv/api/src" }),
    );
  });

  test("nothing focused, or a focused space with no place: none", () => {
    expect(focusedFolder(null, places)).toEqual(Option.none());
    expect(focusedFolder({ space: "remote/s9", cwd: null }, places)).toEqual(Option.none());
  });
});

describe("placeOf", () => {
  const places = spacePlaces(
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

describe("clickCommand", () => {
  test("a new space on another machine opens there", () => {
    expect(
      clickCommand({ _tag: "New", name: "feat", folder: "/r/app.feat", machine: "linux" }),
    ).toEqual({
      command: "space.new",
      args: { name: "feat", folder: "/r/app.feat", machine: "linux" },
    });
  });

  test("a new space on this machine names no machine, as Herdr's own space.new does", () => {
    expect(
      clickCommand({ _tag: "New", name: "feat", folder: "/r/app.feat", machine: THIS_MACHINE }),
    ).toEqual({ command: "space.new", args: { name: "feat", folder: "/r/app.feat" } });
  });

  test("a click on an open worktree selects its space", () => {
    expect(clickCommand({ _tag: "Select", space: "linux/s4" })).toEqual({
      command: "space.select",
      args: { id: "linux/s4" },
    });
  });
});

describe("goTo", () => {
  const wanted = { machine: "linux", folder: "/r/app.feat", name: "feat" };

  test("the space already on the worktree, on its machine", () => {
    const places = [
      { space: { id: "s1", active: false }, machine: null, place: "/r/app.feat" },
      { space: { id: "linux/s2", active: false }, machine: "linux", place: "/r/app.feat/src" },
    ];
    expect(goTo(places, wanted)).toEqual({ _tag: "Select", space: "linux/s2" });
  });

  test("else a new space on the worktree's machine, though this machine has one at that folder", () => {
    const here = [{ space: { id: "s1", active: false }, machine: null, place: "/r/app.feat" }];
    expect(goTo(here, wanted)).toEqual({ _tag: "New", ...wanted });
  });
});
