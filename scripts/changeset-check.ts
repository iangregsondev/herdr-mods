// Checks that a PR carries the changesets its changes need. Every mod with a changed file
// under apps/<name>/ must be named in a changeset the PR adds; a change under packages/
// needs at least one changeset the PR adds, an empty one included; other files need
// nothing. The changesets version PR (head branch changeset-release/main) is skipped.
// Exits 1 naming each mod missing a changeset, and the command to add one.
//
//   vp run check:changesets   (CI, on pull_request; compares with origin/<base branch>)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Data, Effect, Result } from "effect";
import { Git } from "./git.ts";
import { causeText } from "./herdr-host.ts";

/** How far a changeset moves a package's version. */
export type Bump = "major" | "minor" | "patch";

/** The packages a changeset names, each with its bump. Empty for an empty changeset. */
export type ChangesetBumps = Readonly<Record<string, Bump>>;

/** One frontmatter line: a package name, quoted or not, then its bump. */
const BUMP_LINE = /^(["']?)([^"'\s:]+)\1\s*:\s*(major|minor|patch)$/;

const FENCE = "---";

/** `line` as a package name and its bump, if it is a frontmatter bump line. */
const bumpEntry = (line: string): ReadonlyArray<readonly [string, Bump]> => {
  const match = BUMP_LINE.exec(line);
  const [, , name, bump] = match ?? [];
  return name !== undefined && (bump === "major" || bump === "minor" || bump === "patch")
    ? [[name, bump]]
    : [];
};

/**
 * A changeset's frontmatter (the lines between the opening and closing `---`) as package
 * names to bumps, or why it can't be read. An empty frontmatter is an empty changeset.
 */
export const parseChangeset = (text: string): Result.Result<ChangesetBumps, string> => {
  const lines = text.split("\n").map((line) => line.trim());
  const close = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || close === -1) {
    return Result.fail("no frontmatter: the file must open and close with a --- line");
  }
  const body = lines.slice(1, close).filter((line) => line !== "");
  const bad = body.find((line) => bumpEntry(line).length === 0);
  if (bad !== undefined) {
    return Result.fail(`frontmatter line isn't "<package>": major|minor|patch: ${bad}`);
  }
  return Result.succeed(Object.fromEntries(body.flatMap(bumpEntry)));
};

/** What to print and the exit code. */
export interface ChangesetCheckResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ChangesetCheckOptions {
  /** The repo folder. Default: the current folder. */
  readonly repo?: string;
  /** The ref the PR merges into; the PR's changes are `base...HEAD`. Default: `origin/main`. */
  readonly base?: string;
  /** The PR's head branch, when known. The version branch (`VERSION_BRANCH`) is skipped. */
  readonly headBranch?: string;
}

/** The mods (`apps/<name>/`) that `files` touch, sorted, each once. */
const changedMods = (files: ReadonlyArray<string>): ReadonlyArray<string> =>
  [
    ...new Set(
      files.flatMap((file) => {
        const [top, name, ...rest] = file.split("/");
        return top === "apps" && name !== undefined && rest.length > 0 ? [name] : [];
      }),
    ),
  ].sort();

/** A changeset file the PR adds that couldn't be read. */
export class ChangesetUnreadable extends Data.TaggedError("ChangesetUnreadable")<{
  readonly file: string;
  readonly cause: unknown;
}> {}

/** The changesets among the files the PR added: `.changeset/*.md`, without the folder's README. */
const changesetFiles = (added: ReadonlyArray<string>): ReadonlyArray<string> =>
  added.filter((file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== ".changeset/README.md");

/** A changeset file the PR adds whose frontmatter can't be parsed. */
export class ChangesetMalformed extends Data.TaggedError("ChangesetMalformed")<{
  readonly file: string;
  readonly reason: string;
}> {}

/** The packages and bumps the changeset `file` in `repo` names. */
const readChangeset = (repo: string, file: string) =>
  Effect.try({
    try: () => readFileSync(join(repo, file), "utf8"),
    catch: (cause) => new ChangesetUnreadable({ file, cause }),
  }).pipe(
    Effect.flatMap((text) =>
      Effect.fromResult(parseChangeset(text)).pipe(
        Effect.mapError((reason) => new ChangesetMalformed({ file, reason })),
      ),
    ),
  );

const PREFIX = "changeset-check:";

/**
 * The branch `changesets/action` opens the version PR from. That PR bumps mods and
 * deletes changesets but adds none, so the check skips it.
 */
export const VERSION_BRANCH = "changeset-release/main";

const PACKAGES_PROBLEM =
  "packages/ changed, so the PR needs a changeset: name the mods it reaches, " +
  "or add an empty one (vp exec changeset --empty)";

/** Exit 1 with `message` on stderr. */
const problem = (message: string): ChangesetCheckResult => ({
  code: 1,
  stdout: "",
  stderr: `${PREFIX} ${message}\n`,
});

/** Exit 1 with each of `lines` on stderr, then how to add a changeset. */
const failure = (lines: ReadonlyArray<string>): ChangesetCheckResult => ({
  code: 1,
  stdout: "",
  stderr: [...lines, "add one with: vp exec changeset"]
    .map((line) => `${PREFIX} ${line}\n`)
    .join(""),
});

/**
 * Checks that the PR (`base...HEAD` in `repo`) carries the changesets its changes need.
 * Never fails: every failure is a result.
 */
export const runChangesetCheck = Effect.fn("runChangesetCheck")(function* (
  options: ChangesetCheckOptions = {},
): Effect.fn.Return<ChangesetCheckResult> {
  const repo = options.repo ?? ".";
  const base = options.base ?? "origin/main";
  if (options.headBranch === VERSION_BRANCH) {
    return {
      code: 0,
      stdout: `${PREFIX} skipped: ${VERSION_BRANCH} is the changesets version branch\n`,
      stderr: "",
    };
  }
  return yield* Effect.gen(function* () {
    const git = yield* Git;
    const files = yield* git.changedFiles(repo, base);
    const added = yield* git.addedFiles(repo, base);
    const changesets = yield* Effect.forEach(changesetFiles(added), (file) =>
      readChangeset(repo, file),
    );
    const named = new Set(changesets.flatMap((bumps) => Object.keys(bumps)));
    const missing = changedMods(files).filter((mod) => !named.has(mod));
    const packagesUncovered =
      files.some((file) => file.startsWith("packages/")) && changesets.length === 0;
    const problems = [
      ...(missing.length > 0
        ? [`no changeset names these changed mods: ${missing.join(", ")}`]
        : []),
      ...(packagesUncovered ? [PACKAGES_PROBLEM] : []),
    ];
    return problems.length === 0
      ? { code: 0, stdout: `${PREFIX} every changed mod and package has a changeset\n`, stderr: "" }
      : failure(problems);
  }).pipe(
    Effect.provide(Git.layer),
    Effect.catchTags({
      ChangesetMalformed: ({ file, reason }) => Effect.succeed(problem(`${file}: ${reason}`)),
      ChangesetUnreadable: ({ file, cause }) =>
        Effect.succeed(problem(`couldn't read ${file} (${causeText(cause)})`)),
      GitNotStarted: ({ cwd, cause }) =>
        Effect.succeed(problem(`couldn't run git in ${cwd} (${causeText(cause)})`)),
      GitFailed: ({ args, code, stderr }) =>
        Effect.succeed(problem(`git ${args.join(" ")} failed (exit ${code}): ${stderr.trim()}`)),
    }),
  );
});

// On a `pull_request` run, GitHub Actions sets GITHUB_BASE_REF (the branch the PR merges
// into, fetched as origin/<branch> by a full-history checkout) and GITHUB_HEAD_REF (the
// PR's branch). Elsewhere both are unset or empty, and the defaults apply.
if (import.meta.main) {
  const { GITHUB_BASE_REF: baseRef = "", GITHUB_HEAD_REF: headRef = "" } = process.env;
  const result = await Effect.runPromise(
    runChangesetCheck({
      ...(baseRef === "" ? {} : { base: `origin/${baseRef}` }),
      ...(headRef === "" ? {} : { headBranch: headRef }),
    }),
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
