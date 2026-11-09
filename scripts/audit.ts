// Config rot audit: dead paths in docs and rules, rule globs matching no file, hooks and
// locked skills whose files are gone. Prints each problem; exits 1 if there are any.
// Run: vp run audit. The judgment checks are in .claude/skills/audit/SKILL.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { pathRefs, ruleGlobs } from "./audit-config.ts";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
// Installed, not tracked, but docs point into it (node_modules/effect/AGENTS.md).
const roots = [...new Set([...tracked.map((file) => file.split("/")[0] ?? ""), "node_modules"])];
const read = (file: string) => readFileSync(file, "utf8");

// Paths meant to appear later, so docs and rule globs may name them before they exist:
// the first ADR, a personal settings file, the first shared package (pnpm-workspace.yaml).
const PLANNED = ["docs/adr/", ".claude/settings.local.json", "packages/"];
const isPlanned = (path: string) => PLANNED.some((planned) => path.startsWith(planned));

const docs = tracked.filter((file) => file.endsWith(".md") && !file.startsWith(".claude/skills/"));
const deadPaths = docs.flatMap((doc) =>
  pathRefs(read(doc), roots)
    .filter((ref) => !isPlanned(ref) && !existsSync(ref))
    .map((ref) => `${doc}: \`${ref}\` does not exist`),
);

const rules = tracked.filter((file) => /^\.claude\/rules\/[^/]+\.md$/.test(file));
const emptyGlobs = rules.flatMap((rule) =>
  ruleGlobs(read(rule))
    .filter((glob) => !isPlanned(glob) && !tracked.some((file) => matchesGlob(file, glob)))
    .map((glob) => `${rule}: paths glob "${glob}" matches no tracked file`),
);

const settings = read(".claude/settings.json");
const deadHooks = [...settings.matchAll(/\$CLAUDE_PROJECT_DIR\/([^"\\\s]+)/g)]
  .map((match) => match[1] ?? "")
  .filter((file) => !existsSync(file))
  .map((file) => `.claude/settings.json: hook script ${file} does not exist`);

const locked = Object.keys(
  (JSON.parse(read("skills-lock.json")) as { skills: Record<string, unknown> }).skills,
);
const missingSkills = locked
  .filter((name) => !existsSync(`.claude/skills/${name}/SKILL.md`))
  .map((name) => `skills-lock.json: skill ${name} is not in .claude/skills/`);

const problems = [...deadPaths, ...emptyGlobs, ...deadHooks, ...missingSkills];
console.log(problems.length === 0 ? "audit: no config rot found" : problems.join("\n"));
process.exitCode = problems.length === 0 ? 0 : 1;
