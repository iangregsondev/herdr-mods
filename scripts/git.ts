import { spawnSync } from "node:child_process";
import { Context, Data, Effect, Layer } from "effect";

/** git couldn't be started in `cwd` (not installed, or no such folder). */
export class GitNotStarted extends Data.TaggedError("GitNotStarted")<{
  readonly cwd: string;
  readonly cause: unknown;
}> {}

/** git ran in `cwd` and exited non-zero. `stderr` is what git said. */
export class GitFailed extends Data.TaggedError("GitFailed")<{
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly code: number;
  readonly stderr: string;
}> {}

/** Every way a Git call can fail. */
export type GitError = GitNotStarted | GitFailed;

/** Runs git with `args` in `cwd` and gives what it printed on stdout. */
const runGit = Effect.fnUntraced(function* (
  cwd: string,
  args: ReadonlyArray<string>,
): Effect.fn.Return<string, GitError> {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
  if (result.error !== undefined) {
    return yield* new GitNotStarted({ cwd, cause: result.error });
  }
  if (result.status !== 0) {
    // A null status means a signal ended git: no exit code, so -1.
    return yield* new GitFailed({ cwd, args, code: result.status ?? -1, stderr: result.stderr });
  }
  return result.stdout;
});

/** git's NUL-separated output (from `-z`) as a list, without the empty tail. */
const nulList = (out: string): ReadonlyArray<string> => out.split("\0").filter((s) => s !== "");

const TAG_REF = "refs/tags/";

/** The tag names in `git ls-remote --tags` output: one `<sha>\trefs/tags/<name>` per line. */
const tagNames = (out: string): ReadonlyArray<string> =>
  out
    .split("\n")
    .map((line) => line.slice(line.indexOf("\t") + 1))
    .filter((ref) => ref.startsWith(TAG_REF))
    .map((ref) => ref.slice(TAG_REF.length));

/** Git, run in a repo folder given to each call. */
export class Git extends Context.Service<
  Git,
  {
    /**
     * The files HEAD's branch changed since it left `base` (`base...HEAD`), paths
     * relative to the repo root. Commits on `base` after the branch point are left
     * out. A rename lists both the old and the new path; a deleted file is listed.
     */
    readonly changedFiles: (
      repo: string,
      base: string,
    ) => Effect.Effect<ReadonlyArray<string>, GitError>;
    /**
     * The files HEAD's branch added since it left `base` (`base...HEAD`), paths relative
     * to the repo root. A file the base already held is left out, even if the branch
     * changed it; a rename's new path counts as added.
     */
    readonly addedFiles: (
      repo: string,
      base: string,
    ) => Effect.Effect<ReadonlyArray<string>, GitError>;
    /** The names of the tags on the `origin` remote. Tags only in the local repo are left out. */
    readonly originTags: (repo: string) => Effect.Effect<ReadonlyArray<string>, GitError>;
  }
>()("herdr-mods/Git") {
  /** Runs the `git` on PATH. */
  static readonly layer = Layer.succeed(this, {
    changedFiles: (repo, base) =>
      runGit(repo, ["diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`]).pipe(
        Effect.map(nulList),
      ),
    // `--no-renames` reports a rename as a delete and an add, so its new path is listed.
    addedFiles: (repo, base) =>
      runGit(repo, [
        "diff",
        "--name-only",
        "--no-renames",
        "--diff-filter=A",
        "-z",
        `${base}...HEAD`,
      ]).pipe(Effect.map(nulList)),
    // `--refs` drops the peeled `^{}` lines annotated tags add.
    originTags: (repo) =>
      runGit(repo, ["ls-remote", "--tags", "--refs", "origin"]).pipe(Effect.map(tagNames)),
  });
}
