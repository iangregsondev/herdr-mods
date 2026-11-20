import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { nameColor, spacePills } from "../src/look.ts";

describe("spacePills", () => {
  test("a space in no group has no pills", () => {
    expect(spacePills({ group: Option.none() })).toEqual([]);
  });

  test("a space in a group has its group pill, in the dim text of today's group label", () => {
    expect(spacePills({ group: Option.some("Work") })).toEqual([{ label: "Work", color: "dim" }]);
  });
});

describe("nameColor", () => {
  test("a space's name is drawn in the theme's foreground, in a group or not", () => {
    expect([Option.none(), Option.some("Work")].map((group) => nameColor({ group }))).toEqual([
      "foreground",
      "foreground",
    ]);
  });
});
