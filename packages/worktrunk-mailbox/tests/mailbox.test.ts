import { describe, expect, test } from "vite-plus/test";
import { Option } from "effect";
import { deliveryFor, groupsKey, requestKey, spaceGroup } from "../src/index.ts";

const PANEL = "iangregsondev-worktrunk";

/** A layout with the panel's toggle in the tab bar and the panel itself, shown or hidden. */
const tree = (hidden: boolean) => ({
  id: "root",
  type: "row",
  children: [
    {
      id: "tabs-row",
      type: "row",
      children: [{ id: "t", content: { mod: PANEL, props: { role: "toggle" } } }],
    },
    { id: "worktrunk-panel", type: "block", hidden, content: { mod: PANEL } },
  ],
});

describe("requestKey", () => {
  test("is the panel's own shared-state key", () => {
    expect(requestKey(PANEL)).toBe("iangregsondev-worktrunk.request.v1");
  });
});

describe("deliveryFor", () => {
  test("posts straight to a panel that shows", () => {
    expect(deliveryFor(tree(false), PANEL)).toEqual({ _tag: "Post" });
  });

  test("shows a hidden panel first, by its block id, so it reads the request", () => {
    expect(deliveryFor(tree(true), PANEL)).toEqual({ _tag: "ShowThenPost", id: "worktrunk-panel" });
  });

  test("has nowhere to deliver when the layout has no panel, only its toggle", () => {
    const noPanel = { id: "root", type: "row", children: [tree(false).children[0]] };
    expect(deliveryFor(noPanel, PANEL)).toEqual({ _tag: "NoPanel" });
  });
});

describe("groupsKey", () => {
  test("is the panel's own shared-state key for space groups", () => {
    expect(groupsKey(PANEL)).toBe("iangregsondev-worktrunk.groups.v1");
  });
});

describe("spaceGroup", () => {
  test("is the group the panel published for the space", () => {
    expect(spaceGroup({ sp1: "Work", sp2: "Personal" }, "sp2")).toEqual(Option.some("Personal"));
  });

  test("is none for an empty group name, so no empty label is drawn", () => {
    expect(spaceGroup({ sp1: "" }, "sp1")).toEqual(Option.none());
  });

  test("is none for a space with no group, or a published value of another shape", () => {
    expect(spaceGroup({ sp1: "Work" }, "sp9")).toEqual(Option.none());
    expect(spaceGroup({ sp1: 3 }, "sp1")).toEqual(Option.none());
    expect(spaceGroup(undefined, "sp1")).toEqual(Option.none());
    expect(spaceGroup(["Work"], "0")).toEqual(Option.none());
  });
});
