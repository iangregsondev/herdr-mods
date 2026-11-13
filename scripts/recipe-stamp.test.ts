import { describe, expect, test } from "vite-plus/test";
import { stampRecipe } from "./recipe-stamp.ts";

const stamp = {
  version: "1.2.3",
  changelogUrl: "https://example.test/CHANGELOG.md",
};
const line = "Version 1.2.3 · [Changelog](https://example.test/CHANGELOG.md)";

describe("stampRecipe", () => {
  test("puts the stamp line after the first title heading", () => {
    expect(stampRecipe("# hello\n\nA panel.\n\n# Later\n", stamp)).toBe(
      `# hello\n\n${line}\n\nA panel.\n\n# Later\n`,
    );
  });

  test("changes nothing in a recipe it has already stamped", () => {
    const once = stampRecipe("# hello\n\nA panel.\n", stamp);
    expect(stampRecipe(once, stamp)).toBe(once);
  });

  test("replaces the stamp of another version rather than adding a second", () => {
    const old = stampRecipe("# hello\n\nA panel.\n", { ...stamp, version: "0.0.0" });
    expect(stampRecipe(old, stamp)).toBe(`# hello\n\n${line}\n\nA panel.\n`);
  });

  test("puts the stamp line first in a recipe with no title heading", () => {
    expect(stampRecipe("A panel.\n## Setup\n", stamp)).toBe(`${line}\n\nA panel.\n## Setup\n`);
  });

  test("changes nothing in a recipe with no title heading it has already stamped", () => {
    const once = stampRecipe("A panel.\n", stamp);
    expect(stampRecipe(once, stamp)).toBe(once);
  });
});
