import { Result } from "effect";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import {
  auditedDocs,
  checkedTasks,
  formatTaskRef,
  hookScripts,
  isExampleTask,
  isPlanned,
  isTracked,
  lockedSkills,
  manifestTasks,
  pathRefs,
  ruleGlobs,
  taskExists,
  type TaskRef,
  vpRunTasks,
} from "./audit-config.ts";

describe("ruleGlobs", () => {
  const rule = (frontmatter: string) => `---\n${frontmatter}\n---\n\n# Rule\n`;

  test("reads an indented paths list", () => {
    const text = rule('paths:\n  - "apps/*/tests/**"\n  - scripts/*.test.ts');
    expect(ruleGlobs(text)).toEqual(Result.succeed(["apps/*/tests/**", "scripts/*.test.ts"]));
  });

  test("reads an unindented paths list", () => {
    expect(ruleGlobs(rule("paths:\n- apps/**\n- 'docs/*.md'"))).toEqual(
      Result.succeed(["apps/**", "docs/*.md"]),
    );
  });

  test("reads an inline paths list", () => {
    expect(ruleGlobs(rule("paths: [\"apps/**\", 'docs/*.md', scripts/*.ts]"))).toEqual(
      Result.succeed(["apps/**", "docs/*.md", "scripts/*.ts"]),
    );
  });

  test("reads a single paths string", () => {
    expect(ruleGlobs(rule('paths: "apps/**"'))).toEqual(Result.succeed(["apps/**"]));
    expect(ruleGlobs(rule("paths: apps/**"))).toEqual(Result.succeed(["apps/**"]));
  });

  test("reads a rule with CRLF line endings", () => {
    const text =
      "---\r\ndescription: x\r\npaths:\r\n  - apps/**\r\n  - docs/**\r\n---\r\n# Rule\r\n";
    expect(ruleGlobs(text)).toEqual(Result.succeed(["apps/**", "docs/**"]));
  });

  test("reads paths that aren't the first key", () => {
    expect(ruleGlobs(rule("description: x\npaths:\n  - apps/**\nother: y"))).toEqual(
      Result.succeed(["apps/**"]),
    );
  });

  test("a rule without frontmatter or without paths has no globs", () => {
    expect(ruleGlobs("# Always on\n\n- paths:\n  - x\n")).toEqual(Result.succeed([]));
    expect(ruleGlobs(rule("description: x"))).toEqual(Result.succeed([]));
  });

  test("fails with the paths line when it can't read the paths", () => {
    expect(ruleGlobs(rule("paths:\ndescription: x"))).toEqual(Result.fail("paths:"));
    expect(ruleGlobs(rule("paths: [apps/**, docs/**"))).toEqual(
      Result.fail("paths: [apps/**, docs/**"),
    );
    expect(ruleGlobs(rule("paths: {a: b}"))).toEqual(Result.fail("paths: {a: b}"));
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

  test("strips line, column and anchor suffixes", () => {
    const doc =
      "`apps/hello/src/main.ts:12`, `CLAUDE.md:3:7`, `docs/develop.md#dev-loop`, `CLAUDE.md`";
    expect(pathRefs(doc, roots)).toEqual([
      "apps/hello/src/main.ts",
      "CLAUDE.md",
      "docs/develop.md",
    ]);
  });

  test("names each path once", () => {
    expect(pathRefs("`apps/hello/` and `apps/hello/` again", roots)).toEqual(["apps/hello/"]);
  });
});

describe("vpRunTasks", () => {
  test("reads the task each backticked vp run command names", () => {
    const doc = "Run `vp run check:mods`, then `vp run -r build` and `vp run hello#dev`.";
    expect(vpRunTasks(doc)).toEqual([
      { _tag: "Root", task: "check:mods" },
      { _tag: "Recursive", task: "build" },
      { _tag: "Package", pkg: "hello", task: "dev" },
    ]);
  });

  test("skips other vp commands and placeholder tasks", () => {
    expect(vpRunTasks("`vp check`, `vp test`, `vp run <name>`, `vp run -r <task>`")).toEqual([]);
  });

  test("drops placeholder arguments but keeps the task", () => {
    expect(vpRunTasks("`vp run dev:remove <name>`")).toEqual([
      { _tag: "Root", task: "dev:remove" },
    ]);
  });

  test("a placeholder package names a task of any package", () => {
    expect(vpRunTasks("`vp run <name>#dev`")).toEqual([{ _tag: "AnyPackage", task: "dev" }]);
  });

  test("-r takes no value: vp run -r build names build in every package", () => {
    expect(vpRunTasks("`vp run -r build`")).toEqual([{ _tag: "Recursive", task: "build" }]);
  });

  test("skips the values of flags that take one", () => {
    const doc = "`vp run --log grouped check:mods` `vp run --concurrency-limit 2 -r test`";
    expect(vpRunTasks(doc)).toEqual([
      { _tag: "Root", task: "check:mods" },
      { _tag: "Recursive", task: "test" },
    ]);
  });

  test("a filtered or directed run names a task of the selected packages", () => {
    const doc =
      "`vp run --filter hello build` `vp run -F hello dev` `vp run -C apps/hello test` `vp run --filter=hello lint`";
    expect(vpRunTasks(doc)).toEqual([
      { _tag: "AnyPackage", task: "build" },
      { _tag: "AnyPackage", task: "dev" },
      { _tag: "AnyPackage", task: "test" },
      { _tag: "AnyPackage", task: "lint" },
    ]);
  });

  test("reads every vp run in a span", () => {
    const doc = "`vp check && vp run -r test && vp run audit:config; vp run types`";
    expect(vpRunTasks(doc)).toEqual([
      { _tag: "Recursive", task: "test" },
      { _tag: "Root", task: "audit:config" },
      { _tag: "Root", task: "types" },
    ]);
  });

  test("a specifier with no task names nothing", () => {
    expect(vpRunTasks("`vp run hello#` `vp run #`")).toEqual([]);
  });

  test("a placeholder task is skipped even with a real package", () => {
    expect(vpRunTasks("`vp run hello#<task>`")).toEqual([]);
  });
});

describe("taskExists", () => {
  const tasks = {
    root: ["audit:config", "test"],
    packages: new Map([
      ["hello", ["build", "dev"]],
      ["clock", ["build", "test"]],
    ]),
  };

  test("a package task exists when that package has it", () => {
    expect(taskExists({ _tag: "Package", pkg: "hello", task: "dev" }, tasks)).toBe(true);
    expect(taskExists({ _tag: "Package", pkg: "clock", task: "dev" }, tasks)).toBe(false);
    expect(taskExists({ _tag: "Package", pkg: "gone", task: "build" }, tasks)).toBe(false);
  });

  test("a recursive task exists when any package has it", () => {
    expect(taskExists({ _tag: "Recursive", task: "test" }, tasks)).toBe(true);
    expect(taskExists({ _tag: "Recursive", task: "lint" }, tasks)).toBe(false);
  });

  test("a task of any package exists when some package has it", () => {
    expect(taskExists({ _tag: "AnyPackage", task: "dev" }, tasks)).toBe(true);
    expect(taskExists({ _tag: "AnyPackage", task: "audit:config" }, tasks)).toBe(false);
  });

  test("a root task exists when the root defines it", () => {
    expect(taskExists({ _tag: "Root", task: "audit:config" }, tasks)).toBe(true);
    expect(taskExists({ _tag: "Root", task: "build" }, tasks)).toBe(false);
  });
});

describe("isExampleTask", () => {
  test("vp run x and vp run -r x are examples", () => {
    expect(isExampleTask({ _tag: "Root", task: "x" })).toBe(true);
    expect(isExampleTask({ _tag: "Recursive", task: "x" })).toBe(true);
  });

  test("other commands are not examples", () => {
    expect(isExampleTask({ _tag: "Root", task: "dev" })).toBe(false);
    expect(isExampleTask({ _tag: "Package", pkg: "hello", task: "x" })).toBe(false);
  });
});

describe("checkedTasks", () => {
  const guide = "# Using Vite+, the Unified Toolchain for the Web\n\n";

  test("a root vp run dev outside the Vite+ guide is checked", () => {
    expect(checkedTasks("Start it with `vp run dev`.")).toEqual([{ _tag: "Root", task: "dev" }]);
  });

  test("a doc's own vp run dev is checked even when the guide follows", () => {
    const doc = `# Repo\n\nRun \`vp run dev\`.\n\n${guide}\`vp run dev\``;
    expect(checkedTasks(doc)).toEqual([{ _tag: "Root", task: "dev" }]);
  });

  test("the x examples are skipped anywhere", () => {
    expect(checkedTasks("`vp run x`, `vp run -r x`, `vp run hello#x`")).toEqual([
      { _tag: "Package", pkg: "hello", task: "x" },
    ]);
  });

  test("the guide's vp run dev is skipped, its real tasks are checked", () => {
    const doc = `${guide}\`vp run dev\`, \`vp run -r dev\`, \`vp run audit:config\``;
    expect(checkedTasks(doc)).toEqual([
      { _tag: "Recursive", task: "dev" },
      { _tag: "Root", task: "audit:config" },
    ]);
  });
});

describe("isPlanned", () => {
  test("paths under a planned entry are allowed before they exist", () => {
    expect(isPlanned("docs/adr/0001-x.md")).toBe(true);
    expect(isPlanned(".claude/settings.local.json")).toBe(true);
    expect(isPlanned("packages/*/tests/**")).toBe(true);
    expect(isPlanned("docs/develop.md")).toBe(false);
  });
});

describe("hookScripts", () => {
  test("reads hook scripts in both project-dir forms", () => {
    const settings = JSON.stringify({
      hooks: [
        { command: 'sh "$CLAUDE_PROJECT_DIR/.claude/hooks/a.sh"' },
        { command: "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/b.sh --flag" },
      ],
    });
    expect(hookScripts(settings)).toEqual([".claude/hooks/a.sh", ".claude/hooks/b.sh"]);
  });
});

describe("formatTaskRef", () => {
  test("writes each kind of task back as its vp run command", () => {
    expect(formatTaskRef({ _tag: "Root", task: "check:mods" })).toBe("vp run check:mods");
    expect(formatTaskRef({ _tag: "Recursive", task: "build" })).toBe("vp run -r build");
    expect(formatTaskRef({ _tag: "Package", pkg: "hello", task: "dev" })).toBe("vp run hello#dev");
    expect(formatTaskRef({ _tag: "AnyPackage", task: "dev" })).toBe("vp run <package>#dev");
  });
});

describe("lockedSkills", () => {
  test("names the skills in skills-lock.json", () => {
    const lock = { version: 1, skills: { vitest: { source: "x" }, "effect-ts": {} } };
    expect(lockedSkills(lock)).toEqual(Result.succeed(["vitest", "effect-ts"]));
  });

  test("fails on any other shape", () => {
    const failure = Result.fail("skills-lock.json: expected an object of skills under skills");
    expect(lockedSkills({ skills: [] })).toEqual(failure);
    expect(lockedSkills({})).toEqual(failure);
    expect(lockedSkills(null)).toEqual(failure);
    expect(lockedSkills({ skills: "vitest" })).toEqual(failure);
  });
});

describe("manifestTasks", () => {
  test("reads a package.json's name and script names", () => {
    expect(manifestTasks({ name: "hello", scripts: { build: "vp pack", dev: "x" } })).toEqual({
      name: "hello",
      scripts: ["build", "dev"],
    });
  });

  test("a manifest without a name or scripts has neither", () => {
    expect(manifestTasks({ private: true })).toEqual({ name: undefined, scripts: [] });
    expect(manifestTasks({ name: 3, scripts: [] })).toEqual({ name: undefined, scripts: [] });
    expect(manifestTasks("nope")).toEqual({ name: undefined, scripts: [] });
  });
});

describe("isTracked", () => {
  const tracked = ["apps/hello/src/main.ts", "CLAUDE.md", "docs/develop.md"];

  test("a tracked file or a folder holding one is tracked", () => {
    expect(isTracked("CLAUDE.md", tracked)).toBe(true);
    expect(isTracked("apps/hello/", tracked)).toBe(true);
    expect(isTracked("apps/hello", tracked)).toBe(true);
  });

  test("an untracked path or a prefix of a name is not", () => {
    expect(isTracked("docs/notes.md", tracked)).toBe(false);
    expect(isTracked("apps/hel", tracked)).toBe(false);
    expect(isTracked("docs/develop", tracked)).toBe(false);
  });
});

describe("auditedDocs", () => {
  test("every tracked Markdown file except those of locked skills", () => {
    const tracked = [
      "CLAUDE.md",
      "src/main.ts",
      ".claude/skills/audit/SKILL.md",
      ".claude/skills/vitest/SKILL.md",
      ".claude/skills/vitest/references/core-cli.md",
      ".claude/skills/vitest-extra/SKILL.md",
    ];
    expect(auditedDocs(tracked, ["vitest"])).toEqual([
      "CLAUDE.md",
      ".claude/skills/audit/SKILL.md",
      ".claude/skills/vitest-extra/SKILL.md",
    ]);
  });
});

describe("return types", () => {
  test("lists come back readonly", () => {
    expectTypeOf(ruleGlobs("")).toEqualTypeOf<Result.Result<readonly string[], string>>();
    expectTypeOf(pathRefs("", [])).toEqualTypeOf<readonly string[]>();
    expectTypeOf(vpRunTasks("")).toEqualTypeOf<readonly TaskRef[]>();
    expectTypeOf(checkedTasks("")).toEqualTypeOf<readonly TaskRef[]>();
    expectTypeOf(hookScripts("")).toEqualTypeOf<readonly string[]>();
  });
});
