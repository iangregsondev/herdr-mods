// Checks that a PR carries the changesets its changes need. Every mod with a changed file
// under apps/<name>/ must be named in a changeset the PR adds, unless the PR deletes the
// mod; a change under packages/ needs at least one changeset the PR adds, an empty one
// included; other files need nothing. The changesets version PR (head branch
// changeset-release/main) is skipped. Exits 1 naming each mod missing a changeset, and
// the command to add one.
//
//   vp run check:changesets   (CI, on pull_request; compares with origin/<base branch>)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Data, Effect, Option, Result, Schema } from "effect";
import { Git, gitErrorText } from "./git.ts";
import { causeText } from "./herdr-host.ts";
import { runMain, type ScriptResult, scriptFailure } from "./script-result.ts";

/** How far a changeset moves a package's version. */
export const Bump = Schema.Literals(["major", "minor", "patch"]);
export type Bump = typeof Bump.Type;

const isBump = Schema.is(Bump);

/** The packages a changeset names, each with its bump. Empty for an empty changeset. */
export type ChangesetBumps = Readonly<Record<string, Bump>>;

/** One frontmatter line: a package name, quoted or not, a colon, then one word (the bump). */
const BUMP_LINE = /^(["']?)([^"'\s:]+)\1\s*:\s*(\S+)$/;

const FENCE = "---";

/** `line` as a package name and its bump, if it is a frontmatter bump line. */
const bumpEntry = (line: string): Option.Option<readonly [string, Bump]> => {
  const [, , name, bump] = BUMP_LINE.exec(line) ?? [];
  return name !== undefined && isBump(bump) ? Option.some([name, bump]) : Option.none();
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
  const entries = body.map((line) => ({ line, entry: bumpEntry(line) }));
  const bad = entries.find(({ entry }) => Option.isNone(entry));
  if (bad !== undefined) {
    return Result.fail(`frontmatter line isn't "<package>": major|minor|patch: ${bad.line}`);
  }
  return Result.succeed(Object.fromEntries(entries.flatMap(({ entry }) => Option.toArray(entry))));
};

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

/**
 * Whether the checkout still holds the mod `name`. A mod the PR deletes has no
 * package.json, and changesets can't name a package that no longer exists, so it needs
 * no changeset.
 */
const modExists = (repo: string, name: string): boolean =>
  existsSync(join(repo, "apps", name, "package.json"));

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
const failure = (message: string): ScriptResult => scriptFailure(PREFIX, [message]);

/** Exit 1 with each of `lines` on stderr, then how to add a changeset. */
const failureWithAddHint = (lines: ReadonlyArray<string>): ScriptResult =>
  scriptFailure(PREFIX, [...lines, "add one with: vp exec changeset"]);

/**
 * Checks that the PR (`base...HEAD` in `repo`) carries the changesets its changes need.
 * Never fails: every failure is a result.
 */
export const runChangesetCheck = Effect.fn("runChangesetCheck")(function* (
  options: ChangesetCheckOptions = {},
): Effect.fn.Return<ScriptResult> {
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
    const missing = changedMods(files).filter((mod) => modExists(repo, mod) && !named.has(mod));
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
      : failureWithAddHint(problems);
  }).pipe(
    Effect.provide(Git.layer),
    Effect.catchTags({
      ChangesetMalformed: ({ file, reason }) => Effect.succeed(failure(`${file}: ${reason}`)),
      ChangesetUnreadable: ({ file, cause }) =>
        Effect.succeed(failure(`couldn't read ${file} (${causeText(cause)})`)),
      GitNotStarted: (error) => Effect.succeed(failure(gitErrorText(error))),
      GitFailed: (error) => Effect.succeed(failure(gitErrorText(error))),
    }),
  );
});

// On a `pull_request` run, GitHub Actions sets GITHUB_BASE_REF (the branch the PR merges
// into, fetched as origin/<branch> by a full-history checkout) and GITHUB_HEAD_REF (the
// PR's branch). Elsewhere both are unset or empty, and the defaults apply.
if (import.meta.main) {
  const { GITHUB_BASE_REF: baseRef = "", GITHUB_HEAD_REF: headRef = "" } = process.env;
  await runMain(
    runChangesetCheck({
      ...(baseRef === "" ? {} : { base: `origin/${baseRef}` }),
      ...(headRef === "" ? {} : { headBranch: headRef }),
    }),
  );
}
