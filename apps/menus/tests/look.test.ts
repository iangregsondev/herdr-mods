import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { nameColor, spaceMarks, spacePills } from "../src/look.ts";

describe("spacePills", () => {
  test("a space in no group has no pills", () => {
    expect(spacePills({ group: Option.none(), orphan: false })).toEqual([]);
  });

  test("a space in a group has its group pill, in the dim text of today's group label", () => {
    expect(spacePills({ group: Option.some("Work"), orphan: false })).toEqual([
      { label: "Work", color: "dim" },
    ]);
  });

  test("an orphan space in no group has the Orphan pill alone, in the theme's yellow", () => {
    expect(spacePills({ group: Option.none(), orphan: true })).toEqual([
      { label: "Orphan", color: "ansi3" },
    ]);
  });

  test("an orphan space in a group has its group pill, then the Orphan pill", () => {
    expect(spacePills({ group: Option.some("Work"), orphan: true })).toEqual([
      { label: "Work", color: "dim" },
      { label: "Orphan", color: "ansi3" },
    ]);
  });
});

describe("nameColor", () => {
  test("a space's name is drawn in the theme's foreground, in a group or not", () => {
    expect(
      [Option.none(), Option.some("Work")].map((group) => nameColor({ group, orphan: false })),
    ).toEqual(["foreground", "foreground"]);
  });
});

describe("spaceMarks", () => {
  const groups = { sp1: "Work" };
  const orphans = { sp1: { folder: "/r/api.old", repo: "/r/api" } };

  test("an open space the panel published as an orphan is one, with its group", () => {
    expect(spaceMarks("sp1", groups, orphans, ["sp1", "sp2"])).toEqual({
      group: Option.some("Work"),
      orphan: true,
    });
  });

  test("a space the panel published as an orphan is none once it is closed, nor one it never published", () => {
    expect(spaceMarks("sp1", groups, orphans, ["sp2"]).orphan).toBe(false);
    expect(spaceMarks("sp2", groups, orphans, ["sp1", "sp2"])).toEqual({
      group: Option.none(),
      orphan: false,
    });
  });
});
