// Config rot audit: dead paths in docs and rules, rule globs matching no file, `vp run`
// tasks that don't exist, hooks and locked skills whose files are gone.
// Prints each problem; exits 1 if there are any. Run: vp run audit:config.
// The judgment checks are in .claude/skills/audit/SKILL.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { Result } from "effect";
import config from "../vite.config.ts";
import {
  auditedDocs,
  checkedTasks,
  formatTaskRef,
  hookScripts,
  isPlanned,
  isTracked,
  lockedSkills,
  manifestTasks,
  pathRefs,
  ruleGlobs,
  taskExists,
} from "./audit-config.ts";

// Every check goes by git's file list, not the working tree: CI sees only tracked files.
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
// Installed, not tracked, but docs point into it (node_modules/effect/AGENTS.md).
const INSTALLED = "node_modules";
const roots = [...new Set([...tracked.map((file) => file.split("/")[0] ?? ""), INSTALLED])];
const read = (file: string) => readFileSync(file, "utf8");
const readJson = (file: string): unknown => JSON.parse(read(file));

const lock = lockedSkills(readJson("skills-lock.json"));
const locked = Result.getOrElse(lock, () => []);
const badLock = Result.match(lock, { onFailure: (problem) => [problem], onSuccess: () => [] });
const missingSkills = locked
  .filter((name) => !isTracked(`.claude/skills/${name}/SKILL.md`, tracked))
  .map((name) => `skills-lock.json: skill ${name} is not in .claude/skills/`);

const docs = auditedDocs(tracked, locked);
const exists = (ref: string) =>
  ref.split("/")[0] === INSTALLED ? existsSync(ref) : isTracked(ref, tracked);
const deadPaths = docs.flatMap((doc) =>
  pathRefs(read(doc), roots)
    .filter((ref) => !isPlanned(ref) && !exists(ref))
    .map((ref) => `${doc}: \`${ref}\` does not exist`),
);

const rules = tracked.filter((file) => /^\.claude\/rules\/[^/]+\.md$/.test(file));
const emptyGlobs = rules.flatMap((rule) =>
  Result.match(ruleGlobs(read(rule)), {
    onFailure: (line) => [`${rule}: can't read the globs in "${line}"`],
    onSuccess: (globs) =>
      globs
        .filter((glob) => !isPlanned(glob) && !tracked.some((file) => matchesGlob(file, glob)))
        .map((glob) => `${rule}: paths glob "${glob}" matches no tracked file`),
  }),
);

const deadHooks = hookScripts(read(".claude/settings.json"))
  .filter((file) => !isTracked(file, tracked))
  .map((file) => `.claude/settings.json: hook script ${file} does not exist`);

// Tasks: the root's scripts plus vite.config.ts tasks, then each package's scripts by its
// package.json name, which `vp run <name>#task` goes by.
const packages = new Map(
  tracked
    .filter((file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file))
    .map((file) => manifestTasks(readJson(file)))
    .flatMap(({ name, scripts }) => (name === undefined ? [] : [[name, scripts] as const])),
);
const tasks = {
  root: [
    ...manifestTasks(readJson("package.json")).scripts,
    ...Object.keys(config.run?.tasks ?? {}),
  ],
  packages,
};
const deadTasks = docs.flatMap((doc) =>
  checkedTasks(read(doc))
    .filter((ref) => !taskExists(ref, tasks))
    .map((ref) => `${doc}: ${formatTaskRef(ref)} is not a task`),
);

const problems = [
  ...new Set([
    ...badLock,
    ...deadPaths,
    ...emptyGlobs,
    ...deadTasks,
    ...deadHooks,
    ...missingSkills,
  ]),
];
const clean = problems.length === 0;
console.log(clean ? "audit: no config rot found" : problems.join("\n"));
process.exitCode = clean ? 0 : 1;
