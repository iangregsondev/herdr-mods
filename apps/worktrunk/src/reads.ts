// When the panel reads what, and how each read's answer is kept: the decisions behind
// the shell's refreshes. Pure: no `herdr` or `gpui` imports.
import { Option, Result } from "effect";
import type { Ci, Worktree } from "./worktrees.ts";

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

/** One repo's last CI read (`wt list --full`), kept until the next one succeeds. */
export interface CiRead {
  /** Each worktree's CI, by path. */
  readonly byPath: ReadonlyMap<string, Ci>;
  /** The latest CI read failed; `byPath` is from the read before, if any. */
  readonly error: Option.Option<string>;
}

/** A repo's CI after a CI read: each worktree's CI by path, or the old CI with the error. */
export const foldCi = (
  old: Option.Option<CiRead>,
  read: Result.Result<readonly Worktree[], string>,
): CiRead =>
  Result.match(read, {
    onSuccess: (worktrees): CiRead => ({
      byPath: new Map(worktrees.map((w) => [w.path, w.ci])),
      error: Option.none(),
    }),
    onFailure: (error): CiRead => ({
      byPath: Option.match(old, { onNone: () => new Map(), onSome: (ci) => ci.byPath }),
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

/**
 * Whether a refresh reads CI too: when there is no last CI read (`last`, when it started,
 * in ms; none before the first, or once something asks for fresh CI), and once the last
 * is older than `every` ms.
 */
export const ciDue = (
  last: Option.Option<number>,
  { now, every }: { readonly now: number; readonly every: number },
): boolean => Option.match(last, { onNone: () => true, onSome: (at) => now - at > every });

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
  /** The group chip the lists were last read for ("" for All). */
  readonly group: string;
}

export const NO_READS: Reads = { started: false, wasHidden: false, group: "" };

/**
 * What a render starts: `Start` reads everything when the panel first shows, or shows
 * again after being hidden; `NewGroup` reads the repos of a newly picked group chip, CI
 * included; `None` otherwise. Nothing is read while hidden.
 */
export const onRender = (
  reads: Reads,
  now: { readonly shown: boolean; readonly group: string },
): { readonly reads: Reads; readonly step: "Start" | "NewGroup" | "None" } => {
  const wasHidden = !now.shown;
  if (now.shown && (!reads.started || reads.wasHidden)) {
    return { reads: { started: true, wasHidden, group: now.group }, step: "Start" };
  }
  if (now.shown && now.group !== reads.group) {
    return { reads: { ...reads, wasHidden, group: now.group }, step: "NewGroup" };
  }
  return { reads: { ...reads, wasHidden }, step: "None" };
};
