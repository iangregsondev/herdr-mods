// Worktree records from `wt list --format=json`. Pure: no `herdr` or `gpui` imports.
import { Option, Predicate, Result } from "effect";
import { at, finite, parseJson, text } from "worktrunk-mailbox";

/** Where a worktree stands against the default branch. */
export type WorktreeState =
  | { readonly _tag: "Main" }
  /**
   * At main's tip or the main checkout's commit, with no commits or changes of its own:
   * nothing to clean up yet.
   */
  | { readonly _tag: "New" }
  /** In main already; `reason` is wt's integration reason, such as "patch_id_match". */
  | { readonly _tag: "Merged"; readonly reason: Option.Option<string> }
  | { readonly _tag: "Active" }
  | { readonly _tag: "Conflict" };

export type CiStatus = "passed" | "running" | "failed";

/** A worktree's CI, as `wt list --full` reports it. */
export type Ci =
  /** `wt list` ran without `--full`, so CI wasn't asked for. */
  | { readonly _tag: "NotAsked" }
  /** Asked: there is no PR and no checks. */
  | { readonly _tag: "None" }
  /** `stale`: the checks ran on an older commit than the one pushed. */
  | { readonly _tag: "Checks"; readonly status: CiStatus; readonly stale: boolean }
  /** The forge says the PR conflicts with its base. */
  | { readonly _tag: "Conflicts" }
  /** Asked, but the forge gave no answer (rate limit, network, timeout). */
  | { readonly _tag: "Unknown" };

export interface Upstream {
  readonly ahead: number;
  readonly behind: number;
}

export interface Worktree {
  /** None for a detached HEAD. */
  readonly branch: Option.Option<string>;
  readonly path: string;
  readonly state: WorktreeState;
  /** Commits ahead of and behind the default branch. */
  readonly ahead: number;
  readonly behind: number;
  /** Lines added and deleted against the default branch. */
  readonly added: number;
  readonly deleted: number;
  /** Ahead/behind its remote branch; none without one. */
  readonly upstream: Option.Option<Upstream>;
  /** Uncommitted changes of any kind. */
  readonly dirty: boolean;
  readonly ci: Ci;
  /** The last commit's time in ms since the epoch; none on an unborn branch. */
  readonly committedAt: Option.Option<number>;
}

const CHANGE_KINDS = ["staged", "modified", "untracked", "renamed", "deleted", "conflicted"];

// wt leaves out or nulls whatever doesn't apply, so every field but the path is optional.
const count = (item: unknown, ...path: readonly string[]): number =>
  Option.getOrElse(finite(at(item, ...path)), () => 0);

const dirtyOf = (item: unknown): boolean =>
  CHANGE_KINDS.some((kind) => at(item, "worktree", "changes", kind) === true);

const isMain = (item: unknown): boolean => at(item, "worktree", "main") === true;

const headOf = (item: unknown): Option.Option<string> => text(at(item, "head", "sha"));

/**
 * New: no commits or changes of its own, and at main's tip or at the main checkout's commit.
 * wt compares with the remote's main, so a worktree made from a main checkout that hasn't
 * pulled reads as integrated "ancestor" although nothing was done in it.
 */
const isNew = (item: unknown, mainHead: Option.Option<string>): boolean => {
  if (dirtyOf(item) || count(item, "default_branch", "ahead") !== 0) return false;
  const atTip =
    at(item, "display", "state") === "empty" &&
    Option.contains(text(at(item, "default_branch", "integration", "reason")), "same_commit");
  const head = headOf(item);
  const atMainCheckout = Option.isSome(head) && Option.contains(mainHead, head.value);
  return atTip || atMainCheckout;
};

const stateOf = (item: unknown, mainHead: Option.Option<string>): WorktreeState => {
  if (isMain(item)) return { _tag: "Main" };
  if (isNew(item, mainHead)) return { _tag: "New" };
  const state = at(item, "display", "state");
  const reason = text(at(item, "default_branch", "integration", "reason"));
  if (state === "integrated" || state === "empty") return { _tag: "Merged", reason };
  if (state === "would_conflict") return { _tag: "Conflict" };
  return { _tag: "Active" };
};

const committedAt = (item: unknown): Option.Option<number> =>
  text(at(item, "head", "committed_at")).pipe(
    Option.map(Date.parse),
    Option.filter((ms) => !Number.isNaN(ms)),
  );

const CI_STATUSES: readonly unknown[] = ["passed", "running", "failed"] satisfies CiStatus[];

const isCiStatus = (value: unknown): value is CiStatus => CI_STATUSES.includes(value);

const ciOf = (item: unknown, asked: boolean): Ci => {
  if (!asked) return { _tag: "NotAsked" };
  const checks = at(item, "checks");
  const status = at(checks, "status");
  if (isCiStatus(status)) return { _tag: "Checks", status, stale: at(checks, "stale") === true };
  if (at(item, "pr", "mergeable") === false) return { _tag: "Conflicts" };
  // wt's own table: absent means nothing to report, null means asked but not determined.
  if (checks === undefined && at(item, "pr") !== null) return { _tag: "None" };
  return { _tag: "Unknown" };
};

const toWorktree = (
  item: unknown,
  asked: boolean,
  mainHead: Option.Option<string>,
): Option.Option<Worktree> =>
  Option.map(text(at(item, "worktree", "path")), (path) => {
    const upstream = at(item, "upstream");
    return {
      branch: text(at(item, "branch")),
      path,
      state: stateOf(item, mainHead),
      ahead: count(item, "default_branch", "ahead"),
      behind: count(item, "default_branch", "behind"),
      added: count(item, "default_branch", "diff", "added"),
      deleted: count(item, "default_branch", "diff", "deleted"),
      upstream: Predicate.isObject(upstream)
        ? Option.some({ ahead: count(upstream, "ahead"), behind: count(upstream, "behind") })
        : Option.none(),
      dirty: dirtyOf(item),
      ci: ciOf(item, asked),
      committedAt: committedAt(item),
    };
  });

// Schema 2 wraps the items in an object; schema 1 printed a bare array.
const itemsOf = (list: unknown): Result.Result<readonly unknown[], string> => {
  const items = Array.isArray(list) ? list : at(list, "items");
  return Array.isArray(items)
    ? Result.succeed(items)
    : Result.fail("wt list printed no list of worktrees");
};

/** The worktrees in `wt list --format=json` output, in wt's order, or why it didn't parse. */
export const parseList = (output: string): Result.Result<readonly Worktree[], string> =>
  parseJson(output).pipe(
    Result.flatMap((list) =>
      Result.map(itemsOf(list), (items) => {
        // Only `--full` collects CI; the bare-array shape never says, so it counts as not asked.
        const asked = at(list, "collected", "ci") === true;
        const mainHead = Option.flatMap(Option.fromNullishOr(items.find(isMain)), headOf);
        return items.flatMap((item) => Option.toArray(toWorktree(item, asked, mainHead)));
      }),
    ),
  );

/** The last line of `text` that has anything on it; empty when none does. */
export const lastLine = (text: string): string =>
  text.trim().split("\n").filter(Boolean).at(-1) ?? "";

/** Starts each repo's record in the batched read's output (ASCII record separator). */
export const RECORD_START = "\u001e";

/** One record: `<exit code><TAB><folder>`, then on the next lines what `wt list` printed. */
const parseRecord = (
  record: string,
): readonly (readonly [string, Result.Result<readonly Worktree[], string>])[] => {
  const newline = record.indexOf("\n");
  const head = newline < 0 ? record : record.slice(0, newline);
  const body = newline < 0 ? "" : record.slice(newline + 1);
  const tab = head.indexOf("\t");
  if (tab < 0) return [];
  const code = head.slice(0, tab);
  const root = head.slice(tab + 1);
  return [
    [
      root,
      code === "0"
        ? parseList(body)
        : Result.fail(lastLine(body) || `wt list failed (exit ${code})`),
    ],
  ];
};

/**
 * Each repo's `wt list` from the batched read's output, by its folder: its worktrees, or
 * the failed read's last error line.
 */
export const parseLists = (
  stdout: string,
  roots: readonly string[],
): ReadonlyMap<string, Result.Result<readonly Worktree[], string>> => {
  const read = new Map(stdout.split(RECORD_START).flatMap(parseRecord));
  const unanswered: Result.Result<readonly Worktree[], string> = Result.fail(
    "wt list gave no answer for it",
  );
  return new Map(roots.map((root) => [root, read.get(root) ?? unanswered]));
};
