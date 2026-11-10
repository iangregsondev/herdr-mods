import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { findModBlock } from "../src/layout.ts";

const MOD = "iangregsondev-worktrunk";

describe("findModBlock", () => {
  test("finds the block showing the mod, by its content", () => {
    const tree = {
      id: "root",
      type: "row",
      children: [
        { id: "left", type: "block", content: { mod: "spaces" } },
        { id: "b123", type: "block", content: { mod: MOD } },
      ],
    };
    expect(findModBlock(tree, MOD)).toEqual(Option.some({ id: "b123", hidden: false }));
  });

  test("hidden when the block or any node above it is hidden", () => {
    const own = { type: "row", children: [{ id: "b1", content: { mod: MOD }, hidden: true }] };
    const parent = {
      type: "row",
      children: [{ id: "col", hidden: true, children: [{ id: "b1", content: { mod: MOD } }] }],
    };
    expect(findModBlock(own, MOD)).toEqual(Option.some({ id: "b1", hidden: true }));
    expect(findModBlock(parent, MOD)).toEqual(Option.some({ id: "b1", hidden: true }));
  });

  test("none when the layout has no block for it, or isn't a tree", () => {
    expect(findModBlock({ children: [{ id: "x", content: { mod: "other" } }] }, MOD)).toEqual(
      Option.none(),
    );
    expect(findModBlock(null, MOD)).toEqual(Option.none());
    expect(findModBlock("nope", MOD)).toEqual(Option.none());
  });
});
