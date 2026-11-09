// Config rot audit: dead paths in docs and rules, rule globs matching no file, `vp run`
// tasks that don't exist, hooks and locked skills whose files are gone.
// Prints each problem; exits 1 if there are any. Run: vp run audit:config. The judgment checks are in .claude/skills/audit/SKILL.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import config from "../vite.config.ts";
import { pathRefs, ruleGlobs, vpRunTasks } from "./audit-config.ts";

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
  // The skills CLI writes this file; a different shape fails loudly here.
  (JSON.parse(read("skills-lock.json")) as { skills: Record<string, unknown> }).skills,
);
const missingSkills = locked
  .filter((name) => !existsSync(`.claude/skills/${name}/SKILL.md`))
  .map((name) => `skills-lock.json: skill ${name} is not in .claude/skills/`);

// Tasks by package: the root's scripts plus vite.config.ts tasks, then each app's scripts.
const scriptsOf = (file: string) =>
  // package.json: only the scripts' names are read.
  Object.keys((JSON.parse(read(file)) as { scripts?: object }).scripts ?? {});
const appTasks = new Map(
  tracked
    .filter((file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file))
    .map((file) => [file.split("/")[1] ?? "", scriptsOf(file)] as const),
);
const rootTasks = [...scriptsOf("package.json"), ...Object.keys(config.run?.tasks ?? {})];
const taskExists = ({ task, pkg, recursive }: ReturnType<typeof vpRunTasks>[number]) =>
  pkg !== undefined
    ? (appTasks.get(pkg) ?? []).includes(task)
    : recursive
      ? [...appTasks.values()].some((tasks) => tasks.includes(task))
      : rootTasks.includes(task);
// Names CLAUDE.md's generic Vite+ text uses as examples, not tasks of this repo.
const EXAMPLE_TASKS = ["x", "dev"];
const deadTasks = docs.flatMap((doc) =>
  vpRunTasks(read(doc))
    .filter((ref) => !(ref.pkg === undefined && EXAMPLE_TASKS.includes(ref.task)))
    .filter((ref) => !taskExists(ref))
    .map(
      (ref) =>
        `${doc}: vp run ${ref.recursive ? "-r " : ""}${ref.pkg ? `${ref.pkg}#` : ""}${ref.task} is not a task`,
    ),
);

const problems = [
  ...new Set([...deadPaths, ...emptyGlobs, ...deadTasks, ...deadHooks, ...missingSkills]),
];
console.log(problems.length === 0 ? "audit: no config rot found" : problems.join("\n"));
process.exitCode = problems.length === 0 ? 0 : 1;
