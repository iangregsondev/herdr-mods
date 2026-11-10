// When the panel reads what, and how each read's answer is kept: the decisions behind
// the shell's refreshes. Pure: no `herdr` or `gpui` imports.
import { Option, Result } from "effect";
import type { Worktree } from "./worktrees.ts";

/** One repo's `wt list`: its worktrees, and the last read's error, if it failed. */
export interface RepoList {
  readonly _tag: "Read";
  readonly worktrees: readonly Worktree[];
  /** The last read failed; `worktrees` are from the read before, if any. */
  readonly error: Option.Option<string>;
}

/** A repo's list after a read: the new worktrees, or the old ones with the read's error. */
export const foldList = (
  old: Option.Option<RepoList>,
  read: Result.Result<readonly Worktree[], string>,
): RepoList =>
  Result.match(read, {
    onSuccess: (worktrees): RepoList => ({ _tag: "Read", worktrees, error: Option.none() }),
    onFailure: (error): RepoList => ({
      _tag: "Read",
      worktrees: Option.match(old, { onNone: () => [], onSome: (list) => list.worktrees }),
      error: Option.some(error),
    }),
  });

/** The last folder scan: what it scanned (its arguments, as a key) and when, in ms. */
export interface LastScan {
  readonly key: string;
  readonly at: number;
}

/**
 * Whether the group folders are scanned again: always the first time, when `forced`,
 * when the settings change what to scan (`key`), and once the last scan is older than
 * `every` ms.
 */
export const scanDue = (
  last: Option.Option<LastScan>,
  now: {
    readonly forced: boolean;
    readonly key: string;
    readonly now: number;
    readonly every: number;
  },
): boolean =>
  Option.match(last, {
    onNone: () => true,
    onSome: (scan) => now.forced || now.key !== scan.key || now.now - scan.at > now.every,
  });

/** A refresh: with the group folders' scan, or without. */
export interface RefreshAsk {
  readonly scan: boolean;
}

/** The panel's refreshes: one runs at a time, and asks meanwhile make one more. */
export type Loader =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Loading"; readonly again: Option.Option<RefreshAsk> };

export const IDLE: Loader = { _tag: "Idle" };

/**
 * Asking for a refresh: an idle panel starts it; a loading one keeps a single refresh to
 * run after, which scans if any ask did.
 */
export const askRefresh = (
  loader: Loader,
  ask: RefreshAsk,
): { readonly loader: Loader; readonly start: Option.Option<RefreshAsk> } =>
  loader._tag === "Idle"
    ? { loader: { _tag: "Loading", again: Option.none() }, start: Option.some(ask) }
    : {
        loader: {
          _tag: "Loading",
          again: Option.some({
            scan: ask.scan || Option.exists(loader.again, (again) => again.scan),
          }),
        },
        start: Option.none(),
      };

/** A refresh finished: idle again, with the refresh asked for meanwhile, if any. */
export const refreshDone = (
  loader: Loader,
): { readonly loader: Loader; readonly again: Option.Option<RefreshAsk> } => ({
  loader: IDLE,
  again: loader._tag === "Loading" ? loader.again : Option.none(),
});

/** What the panel's renders remember about reading. */
export interface Reads {
  /** It has started reading at least once. */
  readonly started: boolean;
  /** It was hidden at the last render. */
  readonly wasHidden: boolean;
}

export const NO_READS: Reads = { started: false, wasHidden: false };

/**
 * What a render starts: `Start` reads everything when the panel first shows, or shows
 * again after being hidden; `None` otherwise. Nothing is read while hidden.
 */
export const onRender = (
  reads: Reads,
  now: { readonly shown: boolean },
): { readonly reads: Reads; readonly step: "Start" | "None" } => {
  const wasHidden = !now.shown;
  return now.shown && (!reads.started || reads.wasHidden)
    ? { reads: { started: true, wasHidden }, step: "Start" }
    : { reads: { ...reads, wasHidden }, step: "None" };
};
