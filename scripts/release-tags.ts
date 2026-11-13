// The release workflow's publish script, run by `changesets/action/publish` once the
// version PR has merged. It tells the action which release tags to make; it makes none
// itself. For each mod (every apps/* package) whose `<mod id>@<version>` tag isn't on
// origin, it appends one NDJSON event to the file named by CHANGESETS_OUTPUT:
//
//   {"type":"git-tag","tag":"iangregsondev-menus@0.1.0","packageName":"menus"}
//
// The action then pushes each tag and makes a GitHub release from that package's
// CHANGELOG entry. Tags use mod ids, not changesets' `<package>@<version>` (ADR 0004).
// A mod still at 0.0.0 has never been released and gets no event. With every tag
// already on origin it writes nothing, so a later run releases nothing.
// packages/ is never read: worktrunk-mailbox and the root package get no releases.
//
//   vp run release:tags
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { Data, Effect } from "effect";
import { modId } from "../mod-pack.ts";
import { Git, type GitError, gitErrorText } from "./git.ts";
import { causeText } from "./herdr-host.ts";
import { type ModPackage, PackageUnreadable, readModPackage, subfolders } from "./mod-folders.ts";

/** What to print and the exit code. */
export interface ReleaseTagsResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ReleaseTagsOptions {
  /** The repo root: its `apps/*` packages are the mods. */
  readonly repo: string;
  /** The NDJSON file to append events to (`CHANGESETS_OUTPUT`); undefined when unset. */
  readonly output: string | undefined;
}

/** `CHANGESETS_OUTPUT` isn't set, so there's no file to write the events to. */
export class NoOutputFile extends Data.TaggedError("NoOutputFile")<{}> {}

/** The apps/ folder couldn't be listed. */
export class RepoReadFailed extends Data.TaggedError("RepoReadFailed")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** The events couldn't be appended to the output file. */
export class OutputWriteFailed extends Data.TaggedError("OutputWriteFailed")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Every way finding the release tags can fail. */
type ReleaseTagsError =
  | NoOutputFile
  | RepoReadFailed
  | PackageUnreadable
  | OutputWriteFailed
  | GitError;

/** The package of every mod in `repo/apps/`, sorted by folder. */
const modPackages = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<ReadonlyArray<ModPackage>, RepoReadFailed | PackageUnreadable> {
  const apps = join(repo, "apps");
  const folders = yield* subfolders(apps, (cause) => new RepoReadFailed({ path: apps, cause }));
  return yield* Effect.forEach(folders, (folder) =>
    readModPackage(join(apps, folder, "package.json")),
  );
});

/** The version of a mod that has never had a release; it gets no tag. */
const NEVER_RELEASED = "0.0.0";

/** The tag a mod's release gets: its mod id, `@` and its version (`iangregsondev-menus@0.1.0`). */
const releaseTag = (pkg: ModPackage): string => `${modId(pkg.name)}@${pkg.version}`;

/** The changesets output event that has `changesets/action/publish` push `pkg`'s release tag. */
const gitTagEvent = (pkg: ModPackage): string =>
  JSON.stringify({ type: "git-tag", tag: releaseTag(pkg), packageName: pkg.name });

/** Appends an event for each mod whose release tag isn't on origin, and gives those mods. */
const writeReleaseTags = Effect.fnUntraced(function* (
  options: ReleaseTagsOptions,
): Effect.fn.Return<ReadonlyArray<ModPackage>, ReleaseTagsError, Git> {
  const output = options.output;
  if (output === undefined) return yield* new NoOutputFile();
  const packages = yield* modPackages(options.repo);
  const git = yield* Git;
  const onOrigin = new Set(yield* git.originTags(options.repo));
  const unreleased = packages.filter(
    (pkg) => pkg.version !== NEVER_RELEASED && !onOrigin.has(releaseTag(pkg)),
  );
  yield* Effect.try({
    try: () => appendFileSync(output, unreleased.map((pkg) => `${gitTagEvent(pkg)}\n`).join("")),
    catch: (cause) => new OutputWriteFailed({ path: output, cause }),
  });
  return unreleased;
});

/** Exit 1 with `message` on stderr. */
const failure = (message: string): ReleaseTagsResult => ({
  code: 1,
  stdout: "",
  stderr: `release:tags: ${message}\n`,
});

/** Writes the release tag events for `options`. Never fails: every failure is a result. */
export const runReleaseTags = Effect.fn("runReleaseTags")(
  function* (
    options: ReleaseTagsOptions,
  ): Effect.fn.Return<ReleaseTagsResult, ReleaseTagsError, Git> {
    const released = yield* writeReleaseTags(options);
    const stdout =
      released.length === 0
        ? "release:tags: every mod-id tag is on origin; nothing to release\n"
        : released.map((pkg) => `release:tags: ${releaseTag(pkg)}\n`).join("");
    return { code: 0, stdout, stderr: "" };
  },
  Effect.provide(Git.layer),
  Effect.catchTags({
    NoOutputFile: () =>
      Effect.succeed(failure("CHANGESETS_OUTPUT is not set: run from changesets/action/publish")),
    RepoReadFailed: ({ path, cause }) =>
      Effect.succeed(failure(`couldn't read ${path} (${causeText(cause)})`)),
    PackageUnreadable: ({ path, cause }) =>
      Effect.succeed(failure(`couldn't read ${path} (${causeText(cause)})`)),
    OutputWriteFailed: ({ path, cause }) =>
      Effect.succeed(failure(`couldn't write ${path} (${causeText(cause)})`)),
    GitFailed: (error) => Effect.succeed(failure(gitErrorText(error))),
    GitNotStarted: (error) => Effect.succeed(failure(gitErrorText(error))),
  }),
);

if (import.meta.main) {
  const result = await Effect.runPromise(
    runReleaseTags({ repo: process.cwd(), output: process.env.CHANGESETS_OUTPUT }),
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
