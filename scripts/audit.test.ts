import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { type AuditInput, auditProblems } from "./audit.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// A small repo with no rot: a locked skill, a rule, a hook, a package and a doc that
// points at a tracked file, an installed file and tasks of every kind.
const CLEAN: Readonly<Record<string, string>> = {
  "skills-lock.json": JSON.stringify({ version: 1, skills: { vitest: { source: "x" } } }),
  ".claude/skills/vitest/SKILL.md": "# Vitest\n",
  "package.json": JSON.stringify({ name: "root", scripts: { test: "vp test" } }),
  ".claude/settings.json": JSON.stringify({
    hooks: { Stop: [{ hooks: [{ command: 'sh "$CLAUDE_PROJECT_DIR/.claude/hooks/stop.sh"' }] }] },
  }),
  ".claude/hooks/stop.sh": "exit 0\n",
  ".claude/rules/tests.md": '---\npaths:\n  - "scripts/*.test.ts"\n---\n\n# Tests\n',
  "scripts/a.test.ts": "",
  "apps/hello/package.json": JSON.stringify({ name: "hello", scripts: { dev: "vp pack" } }),
  "docs/structure.md": "# Structure\n",
  "CLAUDE.md": [
    "See `scripts/a.test.ts` and `docs/structure.md`.",
    "Read `node_modules/effect/AGENTS.md`.",
    "Run `vp run test`, `vp run audit:config`, `vp run hello#dev` and `vp run -r dev`.",
  ].join("\n"),
};

const INSTALLED = ["node_modules/effect/AGENTS.md"];

/** The clean repo with files changed (a string) or removed (undefined). */
const repo = (changes: Readonly<Record<string, string | undefined>> = {}): AuditInput => {
  const files = new Map(
    Object.entries({ ...CLEAN, ...changes }).flatMap(([file, text]) =>
      text === undefined ? [] : [[file, text] as const],
    ),
  );
  return {
    tracked: [...files.keys()],
    read: (file) => {
      const text = files.get(file);
      if (text === undefined) throw new Error(`read an untracked file: ${file}`);
      return text;
    },
    installedExists: (path) => INSTALLED.includes(path),
    rootTasks: ["audit:config"],
  };
};

const doc = (text: string) => repo({ "CLAUDE.md": text });
const rule = (frontmatter: string) =>
  repo({ ".claude/rules/tests.md": `---\n${frontmatter}\n---\n\n# Tests\n` });

describe("auditProblems", () => {
  test("finds nothing in a clean repo", () => {
    expect(auditProblems(repo())).toEqual([]);
  });

  test("reports a skills-lock.json without an object of skills", () => {
    expect(auditProblems(repo({ "skills-lock.json": JSON.stringify({ version: 1 }) }))).toEqual([
      "skills-lock.json: expected an object of skills under skills",
    ]);
  });

  test("reports a locked skill with no SKILL.md", () => {
    expect(auditProblems(repo({ ".claude/skills/vitest/SKILL.md": undefined }))).toEqual([
      "skills-lock.json: skill vitest is not in .claude/skills/",
    ]);
  });

  test("reports a path in a doc that git doesn't track", () => {
    expect(auditProblems(doc("See `scripts/gone.ts`."))).toEqual([
      "CLAUDE.md: `scripts/gone.ts` does not exist",
    ]);
  });

  test("skips a planned path that doesn't exist yet", () => {
    expect(auditProblems(doc("Decisions go in `docs/adr/0001-first.md`."))).toEqual([]);
  });

  test("checks a node_modules path on disk, not in git", () => {
    const text = "Read `node_modules/effect/AGENTS.md` and `node_modules/gone/AGENTS.md`.";
    expect(auditProblems(doc(text))).toEqual([
      "CLAUDE.md: `node_modules/gone/AGENTS.md` does not exist",
    ]);
  });

  test("reports a rule glob that matches no tracked file", () => {
    expect(auditProblems(rule('paths:\n  - "apps/*/tests/**"'))).toEqual([
      '.claude/rules/tests.md: paths glob "apps/*/tests/**" matches no tracked file',
    ]);
  });

  test("reports a paths line it can't read", () => {
    expect(auditProblems(rule("paths: { a: b }"))).toEqual([
      '.claude/rules/tests.md: can\'t read the globs in "paths: { a: b }"',
    ]);
  });

  test("reports a hook script that's gone", () => {
    expect(auditProblems(repo({ ".claude/hooks/stop.sh": undefined }))).toEqual([
      ".claude/settings.json: hook script .claude/hooks/stop.sh does not exist",
    ]);
  });

  test("reports a root task that is neither a script nor a vite.config.ts task", () => {
    expect(auditProblems(doc("Run `vp run nope`."))).toEqual([
      "CLAUDE.md: vp run nope is not a task",
    ]);
  });

  test("reports a package task the package doesn't have", () => {
    expect(auditProblems(doc("Run `vp run hello#build`."))).toEqual([
      "CLAUDE.md: vp run hello#build is not a task",
    ]);
  });

  test("reports a problem found twice once", () => {
    expect(auditProblems(doc("Run `vp run nope`, then `vp run nope` again."))).toEqual([
      "CLAUDE.md: vp run nope is not a task",
    ]);
  });

  test("lists problems by check: lock, paths, globs, tasks, hooks, skills", () => {
    const input = repo({
      ".claude/skills/vitest/SKILL.md": undefined,
      ".claude/hooks/stop.sh": undefined,
      ".claude/rules/tests.md": '---\npaths:\n  - "apps/*/tests/**"\n---\n',
      "CLAUDE.md": "Run `vp run nope`. See `scripts/gone.ts`.",
    });
    expect(auditProblems(input)).toEqual([
      "CLAUDE.md: `scripts/gone.ts` does not exist",
      '.claude/rules/tests.md: paths glob "apps/*/tests/**" matches no tracked file',
      "CLAUDE.md: vp run nope is not a task",
      ".claude/settings.json: hook script .claude/hooks/stop.sh does not exist",
      "skills-lock.json: skill vitest is not in .claude/skills/",
    ]);
  });
});

describe("audit CLI", () => {
  test("audits this repo, prints that it found no rot and exits 0", () => {
    const result = spawnSync("vpx", ["scripts/audit.ts"], { cwd: repoRoot, encoding: "utf8" });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("audit: no config rot found\n");
  });
});
