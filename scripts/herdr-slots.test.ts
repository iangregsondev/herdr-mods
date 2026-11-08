import { describe, expect, test } from "vite-plus/test";
import { hasSlot, withSlot, withoutSlots, type LayoutNode } from "./herdr-slots.ts";

const slot = (mod: string): LayoutNode => ({ id: `b-${mod}`, type: "block", content: { mod } });

const layout = (): LayoutNode => ({
  id: "root",
  type: "row",
  children: [
    { id: "sidebar", type: "column", children: [slot("spaces")] },
    { id: "work", type: "column", children: [slot("hello"), slot("tabs")] },
    slot("hello"),
  ],
});

describe("hasSlot", () => {
  test("finds a slot nested anywhere", () => {
    expect(hasSlot(layout(), "hello")).toBe(true);
    expect(hasSlot(layout(), "spaces")).toBe(true);
  });

  test("is false when the mod has no slot", () => {
    expect(hasSlot(layout(), "other")).toBe(false);
  });
});

describe("withoutSlots", () => {
  test("removes every slot for the mod, at any depth, and counts them", () => {
    const { node, removed } = withoutSlots(layout(), "hello");
    expect(removed).toBe(2);
    expect(hasSlot(node, "hello")).toBe(false);
    expect(hasSlot(node, "tabs")).toBe(true);
    expect(hasSlot(node, "spaces")).toBe(true);
  });

  test("leaves the tree alone when there is nothing to remove", () => {
    const { node, removed } = withoutSlots(layout(), "other");
    expect(removed).toBe(0);
    expect(node).toEqual(layout());
  });
});

describe("withSlot", () => {
  const bare = (): LayoutNode => withoutSlots(layout(), "hello").node;

  test("right docks at the end of the root row, with the mod's size", () => {
    const next = withSlot(bare(), "hello", "right", 240)!;
    const last = next.children!.at(-1)!;
    expect(last).toMatchObject({ type: "block", content: { mod: "hello" }, size: { px: 240 } });
    expect(last.id).toMatch(/^b[0-9a-f]{32}$/);
    expect(next.children).toHaveLength(3);
  });

  test("left docks at the start", () => {
    const next = withSlot(bare(), "hello", "left", 240)!;
    expect(next.children![0].content).toEqual({ mod: "hello" });
  });

  test("leaves size out when mod.json has none", () => {
    const next = withSlot(bare(), "hello", "right", undefined)!;
    expect(next.children!.at(-1)).not.toHaveProperty("size");
  });

  test("won't guess for other places or a root that isn't a row", () => {
    expect(withSlot(bare(), "hello", "top", 240)).toBeNull();
    expect(withSlot(bare(), "hello", "none", 240)).toBeNull();
    expect(withSlot({ ...bare(), type: "column" }, "hello", "right", 240)).toBeNull();
  });
});
