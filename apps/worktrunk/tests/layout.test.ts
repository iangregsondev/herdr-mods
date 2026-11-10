import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { findModBlock, findRoleBlock, ROLES, roleOf } from "../src/layout.ts";

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

  test("finds the panel, not a block that shows the mod in another role", () => {
    const tree = {
      type: "column",
      children: [
        { id: "toggle", content: { mod: MOD, props: { role: "toggle" } } },
        { id: "panel", content: { mod: MOD } },
      ],
    };
    expect(findModBlock(tree, MOD)).toEqual(Option.some({ id: "panel", hidden: false }));
  });

  test("a block whose props name the panel role is the panel", () => {
    const tree = { children: [{ id: "p", content: { mod: MOD, props: { role: "panel" } } }] };
    expect(findModBlock(tree, MOD)).toEqual(Option.some({ id: "p", hidden: false }));
  });

  test("a block naming a role it doesn't know is not the panel", () => {
    const tree = { children: [{ id: "x", content: { mod: MOD, props: { role: "sidebar" } } }] };
    expect(findModBlock(tree, MOD)).toEqual(Option.none());
  });

  test("none when the layout has no block for it, or isn't a tree", () => {
    expect(findModBlock({ children: [{ id: "x", content: { mod: "other" } }] }, MOD)).toEqual(
      Option.none(),
    );
    expect(findModBlock(null, MOD)).toEqual(Option.none());
    expect(findModBlock("nope", MOD)).toEqual(Option.none());
  });
});

describe("roleOf", () => {
  test.each(ROLES)("reads the %s role a layout block gave", (role) => {
    expect(roleOf({ role })).toEqual(Option.some(role));
  });

  test.each(["menu", "confirm", "new", "titlebar"])("reads the %s role an overlay gave", (role) => {
    expect(roleOf({ role, overlay: "o1" })).toEqual(Option.some(role));
  });

  test("is the panel when props give no role, or aren't an object", () => {
    expect(roleOf({})).toEqual(Option.some("panel"));
    expect(roleOf({ role: 3 })).toEqual(Option.some("panel"));
    expect(roleOf(null)).toEqual(Option.some("panel"));
    expect(roleOf(undefined)).toEqual(Option.some("panel"));
  });

  test("is none for a role name it doesn't know, never the panel", () => {
    expect(roleOf({ role: "sidebar" })).toEqual(Option.none());
  });
});

describe("findRoleBlock", () => {
  test("finds the block showing the mod in the given role, with whether it shows", () => {
    const tree = {
      type: "column",
      children: [
        { id: "panel", content: { mod: MOD } },
        {
          id: "bar",
          hidden: true,
          children: [{ id: "t", content: { mod: MOD, props: { role: "toggle" } } }],
        },
      ],
    };
    expect(findRoleBlock(tree, MOD, "toggle")).toEqual(Option.some({ id: "t", hidden: true }));
    expect(findRoleBlock(tree, MOD, "panel")).toEqual(Option.some({ id: "panel", hidden: false }));
  });
});
