import { describe, expect, test } from "vite-plus/test";
import { pathRefs, ruleGlobs } from "./audit-config.ts";

describe("ruleGlobs", () => {
  test("reads the paths list from a rule's frontmatter", () => {
    const rule = '---\npaths:\n  - "apps/*/tests/**"\n  - scripts/*.test.ts\n---\n\n# Tests\n';
    expect(ruleGlobs(rule)).toEqual(["apps/*/tests/**", "scripts/*.test.ts"]);
  });

  test("a rule without frontmatter has no globs", () => {
    expect(ruleGlobs("# Always on\n\n- paths:\n  - x\n")).toEqual([]);
  });
});

describe("pathRefs", () => {
  const roots = ["apps", "docs", ".claude", "CLAUDE.md"];

  test("finds backticked paths under the repo's top-level entries", () => {
    const doc = "Read `docs/develop.md` and `.claude/rules/tests.md`, then `CLAUDE.md`.";
    expect(pathRefs(doc, roots)).toEqual([
      "docs/develop.md",
      ".claude/rules/tests.md",
      "CLAUDE.md",
    ]);
  });

  test("skips placeholders, globs, home paths, import specifiers and commands", () => {
    const doc = [
      "`apps/<name>/src/main.ts`",
      "`apps/*/tests/**`",
      "`~/.config/herdr-app/AGENTS.md`",
      "`vite-plus/test`",
      "`vp -C apps/hello test`",
      "`.scratch/plan-x.md`",
    ].join(" ");
    expect(pathRefs(doc, roots)).toEqual([]);
  });

  test("names each path once", () => {
    expect(pathRefs("`apps/hello/` and `apps/hello/` again", roots)).toEqual(["apps/hello/"]);
  });
});
