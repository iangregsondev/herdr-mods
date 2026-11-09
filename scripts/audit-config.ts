// Pure checks for config rot in the repo's docs and Claude config. No file access here:
// scripts/audit.ts reads the files and runs these.
import { Predicate, Result } from "effect";

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const LIST_ITEM = /^\s*-(?:\s|$)/;
// Items of an inline list: quoted strings (which may hold commas) or bare words.
const INLINE_ITEM = /"([^"]*)"|'([^']*)'|([^,\s][^,]*)/g;

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, "$2");

/**
 * The `paths:` globs in a rule's frontmatter; none means the rule always loads. Reads a
 * block list (indented or not), an inline `[a, b]` list or a single string. Any other
 * `paths:` fails with its line, so a rule whose globs can't be read is reported, not skipped.
 */
export const ruleGlobs = (markdown: string): Result.Result<readonly string[], string> => {
  const lines = (FRONTMATTER.exec(markdown.replace(/\r\n/g, "\n"))?.[1] ?? "").split("\n");
  const line = lines.find((text) => text.startsWith("paths:"));
  if (line === undefined) return Result.succeed([]);
  const value = line.slice("paths:".length).trim();
  if (value === "") {
    const rest = lines.slice(lines.indexOf(line) + 1);
    const end = rest.findIndex((text) => !LIST_ITEM.test(text));
    const items = rest.slice(0, end === -1 ? rest.length : end);
    return items.length === 0
      ? Result.fail(line.trim())
      : Result.succeed(items.map((item) => unquote(item.replace(LIST_ITEM, ""))));
  }
  if (value.startsWith("[")) {
    return value.endsWith("]")
      ? Result.succeed(
          [...value.slice(1, -1).matchAll(INLINE_ITEM)].map((match) =>
            (match[1] ?? match[2] ?? match[3] ?? "").trim(),
          ),
        )
      : Result.fail(line.trim());
  }
  // Flow mappings, block scalars, anchors and tags aren't globs.
  return /^[{|>&*!]/.test(value) ? Result.fail(line.trim()) : Result.succeed([unquote(value)]);
};

// Placeholders (`<name>`), globs, home and absolute paths, variables and commands.
const NOT_A_PATH = /[<>*\s~$]|^\//;

// A location inside the file: `main.ts:12`, `main.ts:12:3`, `develop.md#dev-loop`.
const LOCATION = /(?::\d+){1,2}$|#[^/]*$/;

/**
 * Backticked paths in a doc that sit under one of the repo's top-level entries (`roots`),
 * without any line or anchor suffix, once each. Anything else in backticks (import
 * specifiers, commands) is ignored.
 */
export const pathRefs = (markdown: string, roots: readonly string[]): readonly string[] => {
  const paths = [...markdown.matchAll(/`([^`\n]+)`/g)]
    .map((match) => (match[1] ?? "").replace(LOCATION, ""))
    .filter((span) => !NOT_A_PATH.test(span) && roots.includes(span.split("/")[0] ?? ""));
  return [...new Set(paths)];
};

/**
 * A task a `vp run` command names: at the root, in every package (`-r`), in one package
 * (`hello#dev`), or in some package left as a placeholder (`<name>#dev`).
 */
export type TaskRef =
  | { readonly _tag: "Root"; readonly task: string }
  | { readonly _tag: "Recursive"; readonly task: string }
  | { readonly _tag: "Package"; readonly pkg: string; readonly task: string }
  | { readonly _tag: "AnyPackage"; readonly task: string };

const isPlaceholder = (word: string) => /[<>]/.test(word);

// `vp run` flags whose value is the next word, and the flags that pick the packages to run in.
const VALUE_FLAGS = ["-F", "--filter", "-C", "--log", "--concurrency-limit"];
const SELECTS_PACKAGES = /^(?:-F|--filter|-C)(?:=|$)/;

type Words = { readonly flags: readonly string[]; readonly positional: readonly string[] };

// Flags come before the task specifier; everything from the specifier on goes to the task.
const splitFlags = (words: readonly string[]): Words => {
  const [word, ...rest] = words;
  if (word === undefined || !word.startsWith("-")) return { flags: [], positional: words };
  const next = splitFlags(rest.slice(VALUE_FLAGS.includes(word) ? 1 : 0));
  return { flags: [word, ...next.flags], positional: next.positional };
};

const taskRef = (words: readonly string[]): readonly TaskRef[] => {
  const { flags, positional } = splitFlags(words);
  const spec = positional[0];
  if (spec === undefined) return [];
  const hash = spec.indexOf("#");
  const pkg = hash === -1 ? undefined : spec.slice(0, hash);
  const task = spec.slice(hash + 1);
  if (task === "" || isPlaceholder(task)) return [];
  if (pkg !== undefined) {
    return [isPlaceholder(pkg) ? { _tag: "AnyPackage", task } : { _tag: "Package", pkg, task }];
  }
  if (flags.some((flag) => SELECTS_PACKAGES.test(flag))) return [{ _tag: "AnyPackage", task }];
  const recursive = flags.includes("-r") || flags.includes("--recursive");
  return [recursive ? { _tag: "Recursive", task } : { _tag: "Root", task }];
};

/**
 * The task each `vp run` command in a doc's backticks names, every command in a span
 * joined with `&&`, `||` or `;`: `vp run -r build`, `vp run hello#dev`.
 */
export const vpRunTasks = (markdown: string): readonly TaskRef[] =>
  [...markdown.matchAll(/`([^`\n]+)`/g)]
    .flatMap((match) => (match[1] ?? "").split(/&&|\|\||;/))
    .map((command) => command.trim().split(/\s+/))
    .filter(([vp, run]) => vp === "vp" && run === "run")
    .flatMap((words) => taskRef(words.slice(2)));

/** The repo's tasks: the root's (scripts and vite.config.ts tasks), and each package's by name. */
export type Tasks = {
  readonly root: readonly string[];
  readonly packages: ReadonlyMap<string, readonly string[]>;
};

export const taskExists = (ref: TaskRef, tasks: Tasks): boolean => {
  switch (ref._tag) {
    case "Root":
      return tasks.root.includes(ref.task);
    case "Recursive":
    case "AnyPackage":
      return [...tasks.packages.values()].some((names) => names.includes(ref.task));
    case "Package":
      return (tasks.packages.get(ref.pkg) ?? []).includes(ref.task);
  }
};

const sameTask = (a: TaskRef) => (b: TaskRef) => a._tag === b._tag && a.task === b.task;

// CLAUDE.md's package-manager table uses `x` as a placeholder task: `vp run x`, `vp run -r x`.
const EXAMPLE_TASKS: readonly TaskRef[] = [
  { _tag: "Root", task: "x" },
  { _tag: "Recursive", task: "x" },
];

export const isExampleTask = (ref: TaskRef): boolean => EXAMPLE_TASKS.some(sameTask(ref));

// The generic Vite+ text `vp` writes at the end of CLAUDE.md, and the one command it names
// as an example (`vp dev` and `vp run dev` may do different things).
const VITE_PLUS_GUIDE = /^# Using Vite\+/m;
const GUIDE_EXAMPLE: TaskRef = { _tag: "Root", task: "dev" };

/**
 * The tasks a doc's `vp run` commands name, less the example commands. The guide's
 * `vp run dev` is skipped only inside that text, so a real `vp run dev` elsewhere is checked.
 */
export const checkedTasks = (markdown: string): readonly TaskRef[] => {
  const start = VITE_PLUS_GUIDE.exec(markdown)?.index ?? markdown.length;
  return [
    ...vpRunTasks(markdown.slice(0, start)),
    ...vpRunTasks(markdown.slice(start)).filter((ref) => !sameTask(GUIDE_EXAMPLE)(ref)),
  ].filter((ref) => !isExampleTask(ref));
};

// Paths meant to appear later, so docs and rule globs may name them before they exist:
// the first ADR, a personal settings file, the first shared package (pnpm-workspace.yaml).
export const PLANNED: readonly string[] = ["docs/adr/", ".claude/settings.local.json", "packages/"];

export const isPlanned = (path: string): boolean =>
  PLANNED.some((planned) => path.startsWith(planned));

/** Repo files the hooks in `.claude/settings.json` run: `$CLAUDE_PROJECT_DIR/x` or `${...}/x`. */
export const hookScripts = (settingsText: string): readonly string[] =>
  [...settingsText.matchAll(/\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})\/([^"'\\\s]+)/g)].map(
    (match) => match[1] ?? "",
  );

/** A task reference written back as the `vp run` command that names it. */
export const formatTaskRef = (ref: TaskRef): string => {
  switch (ref._tag) {
    case "Root":
      return `vp run ${ref.task}`;
    case "Recursive":
      return `vp run -r ${ref.task}`;
    case "Package":
      return `vp run ${ref.pkg}#${ref.task}`;
    case "AnyPackage":
      return `vp run <package>#${ref.task}`;
  }
};

/** The skills `skills-lock.json` lists; the skills CLI writes it as `{ skills: { <name>: … } }`. */
export const lockedSkills = (lock: unknown): Result.Result<readonly string[], string> =>
  Predicate.isObject(lock) && Predicate.isObject(lock["skills"])
    ? Result.succeed(Object.keys(lock["skills"]))
    : Result.fail("skills-lock.json: expected an object of skills under skills");

/** A package.json's name, which `vp run <name>#task` goes by, and its script names. */
export const manifestTasks = (
  manifest: unknown,
): { readonly name: string | undefined; readonly scripts: readonly string[] } => {
  const fields = Predicate.isObject(manifest) ? manifest : {};
  const name = fields["name"];
  const scripts = fields["scripts"];
  return {
    name: Predicate.isString(name) ? name : undefined,
    scripts: Predicate.isObject(scripts) ? Object.keys(scripts) : [],
  };
};

/** Whether git tracks the file, or a file inside the folder (with or without a trailing `/`). */
export const isTracked = (path: string, tracked: readonly string[]): boolean => {
  const folder = path.endsWith("/") ? path : `${path}/`;
  return tracked.some((file) => file === path || file.startsWith(folder));
};

/**
 * The docs the audit reads: every tracked Markdown file, less the skills `skills-lock.json`
 * installs, which the skills CLI owns and overwrites. The repo's own skills are audited.
 */
export const auditedDocs = (
  tracked: readonly string[],
  locked: readonly string[],
): readonly string[] =>
  tracked.filter(
    (file) =>
      file.endsWith(".md") && !locked.some((name) => file.startsWith(`.claude/skills/${name}/`)),
  );
