import { Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { applyPatches, describeMisses } from "../src/patch.ts";

const A = { name: "first", find: "red", replace: "green" };
const B = { name: "second", find: "one", replace: "two" };

describe("applyPatches", () => {
  test("replaces each patch point that occurs exactly once", () => {
    expect(applyPatches("red fish, one fish", [A, B])).toEqual(
      Result.succeed("green fish, two fish"),
    );
  });

  test("appends the tail after the patched text", () => {
    expect(applyPatches("red", [A], "\n// tail")).toEqual(Result.succeed("green\n// tail"));
  });

  test("leaves `$` patterns in the replacement as written", () => {
    expect(applyPatches("red", [{ name: "x", find: "red", replace: "$& $1 $$" }])).toEqual(
      Result.succeed("$& $1 $$"),
    );
  });

  test("a patch point that isn't there fails, named, with nothing applied", () => {
    expect(applyPatches("red fish", [A, B])).toEqual(Result.fail([{ name: "second", found: 0 }]));
  });

  test("a patch point found more than once fails too, with its count", () => {
    expect(applyPatches("red red, one", [A, B])).toEqual(
      Result.fail([{ name: "first", found: 2 }]),
    );
  });

  test("names every patch point that misses, not only the first", () => {
    expect(applyPatches("red red", [A, B])).toEqual(
      Result.fail([
        { name: "first", found: 2 },
        { name: "second", found: 0 },
      ]),
    );
  });

  test("an empty patch point is never found", () => {
    expect(applyPatches("red", [{ name: "empty", find: "", replace: "x" }])).toEqual(
      Result.fail([{ name: "empty", found: 0 }]),
    );
  });
});

describe("describeMisses", () => {
  test("a patch point that isn't there is named as not found", () => {
    expect(describeMisses([{ name: "second", found: 0 }])).toBe("second (not found)");
  });

  test("a patch point found more than once says how often", () => {
    expect(describeMisses([{ name: "first", found: 2 }])).toBe(
      "first (found 2 times, expected once)",
    );
  });

  test("names each patch point in turn, comma-separated", () => {
    expect(
      describeMisses([
        { name: "first", found: 2 },
        { name: "second", found: 0 },
      ]),
    ).toBe("first (found 2 times, expected once), second (not found)");
  });
});
