// Worktree records from `wt list --format=json`. Pure: no `herdr` or `gpui` imports.
import { Option, Predicate, Result } from "effect";
import { at, finite, parseJson, text } from "./json.ts";

/** Where a worktree stands against the default branch. */
export type WorktreeState =
  | { readonly _tag: "Main" }
  /** In main already; `reason` is wt's integration reason, such as "patch_id_match". */
  | { readonly _tag: "Merged"; readonly reason: Option.Option<string> }
  | { readonly _tag: "Active" }
  | { readonly _tag: "Conflict" };

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
  /** The last commit's time in ms since the epoch; none on an unborn branch. */
  readonly committedAt: Option.Option<number>;
}

const CHANGE_KINDS = ["staged", "modified", "untracked", "renamed", "deleted", "conflicted"];

// wt leaves out or nulls whatever doesn't apply, so every field but the path is optional.
const count = (item: unknown, ...path: readonly string[]): number =>
  Option.getOrElse(finite(at(item, ...path)), () => 0);

const stateOf = (item: unknown): WorktreeState => {
  if (at(item, "worktree", "main") === true) return { _tag: "Main" };
  const state = at(item, "display", "state");
  if (state === "integrated" || state === "empty") {
    return { _tag: "Merged", reason: text(at(item, "default_branch", "integration", "reason")) };
  }
  if (state === "would_conflict") return { _tag: "Conflict" };
  return { _tag: "Active" };
};

const committedAt = (item: unknown): Option.Option<number> =>
  text(at(item, "head", "committed_at")).pipe(
    Option.map(Date.parse),
    Option.filter((ms) => !Number.isNaN(ms)),
  );

const toWorktree = (item: unknown): Option.Option<Worktree> =>
  Option.map(text(at(item, "worktree", "path")), (path) => {
    const upstream = at(item, "upstream");
    return {
      branch: text(at(item, "branch")),
      path,
      state: stateOf(item),
      ahead: count(item, "default_branch", "ahead"),
      behind: count(item, "default_branch", "behind"),
      added: count(item, "default_branch", "diff", "added"),
      deleted: count(item, "default_branch", "diff", "deleted"),
      upstream: Predicate.isObject(upstream)
        ? Option.some({ ahead: count(upstream, "ahead"), behind: count(upstream, "behind") })
        : Option.none(),
      dirty: CHANGE_KINDS.some((kind) => at(item, "worktree", "changes", kind) === true),
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
    Result.flatMap(itemsOf),
    Result.map((items) => items.flatMap((item) => Option.toArray(toWorktree(item)))),
  );
