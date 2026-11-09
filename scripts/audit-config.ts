// Pure checks for config rot in the repo's docs and Claude config. No file access here:
// scripts/audit.ts reads the files and runs these.

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

/** The `paths:` globs in a rule's frontmatter; none means the rule always loads. */
export const ruleGlobs = (markdown: string): string[] => {
  const frontmatter = FRONTMATTER.exec(markdown)?.[1] ?? "";
  const block = /^paths:\n((?:\s+-.*\n?)*)/m.exec(frontmatter)?.[1] ?? "";
  return block
    .split("\n")
    .map((line) => /^\s+-\s*["']?(.+?)["']?\s*$/.exec(line)?.[1])
    .filter((glob): glob is string => glob !== undefined);
};

// Placeholders (`<name>`), globs, home and absolute paths, variables and commands.
const NOT_A_PATH = /[<>*\s~$]|^\//;

/**
 * Backticked paths in a doc that sit under one of the repo's top-level entries (`roots`),
 * once each. Anything else in backticks (import specifiers, commands) is ignored.
 */
export const pathRefs = (markdown: string, roots: readonly string[]): string[] => {
  const spans = [...markdown.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? "");
  const paths = spans.filter(
    (span) => !NOT_A_PATH.test(span) && roots.includes(span.split("/")[0] ?? ""),
  );
  return [...new Set(paths)];
};

export type TaskRef = { task: string; pkg?: string; recursive: boolean };

/** The task each backticked `vp run` command names: `vp run -r build`, `vp run hello#dev`. */
export const vpRunTasks = (markdown: string): TaskRef[] =>
  [...markdown.matchAll(/`vp run ([^`\n]+)`/g)]
    .map((match) => (match[1] ?? "").split(/\s+/))
    .filter((words) => !words.some((word) => /[<>]/.test(word)))
    .flatMap((words): TaskRef[] => {
      const spec = words.find((word) => !word.startsWith("-"));
      if (spec === undefined) return [];
      const recursive = words.includes("-r");
      const [pkg, task] = spec.includes("#") ? spec.split("#") : [undefined, spec];
      return task === undefined ? [] : [pkg ? { task, pkg, recursive } : { task, recursive }];
    });
