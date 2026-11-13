// The New-or-open worktree dialog: the branches to offer, what the typed text matches,
// the dialog's state and what Enter asks the panel to run. Pure: no `herdr` or `gpui`
// imports.
import { Option, Result } from "effect";
import { isShortcut } from "./commands.ts";
import type { Action } from "./menus.ts";
import { THIS_MACHINE, type RepoId } from "./machines.ts";
import { lastSegment, tildePath } from "./settings.ts";
import type { Worktree } from "./worktrees.ts";

/** A branch the dialog can offer: local, or only on origin. */
export interface Branch {
  readonly name: string;
  /** On origin (`refs/remotes/origin/<name>`), not a local branch. */
  readonly remote: boolean;
}

const LOCAL = "refs/heads/";
const ORIGIN = "refs/remotes/origin/";

/** `git for-each-ref --format=%(refname) refs/heads refs/remotes/origin` output read. */
export const parseBranches = (output: string): readonly Branch[] =>
  output.split("\n").flatMap((line): Branch[] => {
    const ref = line.trim();
    if (ref.startsWith(LOCAL)) return [{ name: ref.slice(LOCAL.length), remote: false }];
    if (ref.startsWith(ORIGIN) && ref !== `${ORIGIN}HEAD`) {
      return [{ name: ref.slice(ORIGIN.length), remote: true }];
    }
    return [];
  });

/** One line of the dialog's list: what Enter switches to or creates. */
export type Choice =
  /** A worktree that exists, by its branch. */
  | { readonly _tag: "Worktree"; readonly branch: string; readonly path: string }
  /** A branch with no worktree yet: switching makes one. */
  | { readonly _tag: "Branch"; readonly name: string; readonly remote: boolean }
  /** The text as typed: a new branch, or a wt shortcut (`pr:N`, `mr:N`, a link). */
  | { readonly _tag: "Typed"; readonly name: string; readonly shortcut: boolean };

/** Every worktree with a branch, then local branches without one, then origin-only ones. */
const candidates = (worktrees: readonly Worktree[], branches: readonly Branch[]): Choice[] => {
  const open = worktrees.flatMap((w): Choice[] =>
    Option.match(w.branch, {
      onNone: () => [],
      onSome: (branch) => [{ _tag: "Worktree", branch, path: w.path }],
    }),
  );
  const taken = new Set(open.map(choiceName));
  const local = branches.filter((b) => !b.remote && !taken.has(b.name));
  const localNames = new Set(branches.filter((b) => !b.remote).map((b) => b.name));
  const remote = branches.filter((b) => b.remote && !localNames.has(b.name) && !taken.has(b.name));
  return [
    ...open,
    ...[...local, ...remote].map((b): Choice => ({
      _tag: "Branch",
      name: b.name,
      remote: b.remote,
    })),
  ];
};

/** The dialog's list for the typed text, at most `limit` lines. */
export const choicesFor = (
  typed: string,
  worktrees: readonly Worktree[],
  branches: readonly Branch[],
  limit: number,
): readonly Choice[] => {
  const name = typed.trim();
  if (isShortcut(name)) return [{ _tag: "Typed", name, shortcut: true }];
  const query = name.toLowerCase();
  const matches = ranked(candidates(worktrees, branches), choiceName, query);
  const exact = matches.some((choice) => choiceName(choice).toLowerCase() === query);
  const typedLine: Choice[] =
    name === "" || exact ? [] : [{ _tag: "Typed", name, shortcut: false }];
  return [...typedLine, ...matches].slice(0, Math.max(0, limit));
};

/**
 * The items whose name holds `query` (lower case), best first (see `rank`), keeping their
 * order within a rank.
 */
const ranked = <A>(items: readonly A[], nameOf: (item: A) => string, query: string): A[] =>
  items
    .flatMap((item, order) =>
      Option.match(rank(nameOf(item), query), {
        onNone: () => [],
        onSome: (score) => [{ item, score, order }],
      }),
    )
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map(({ item }) => item);

/** 0 for an exact match, 1 for a prefix, 2 anywhere in the name; none when it doesn't match. */
const rank = (name: string, query: string): Option.Option<number> => {
  const lower = name.toLowerCase();
  if (lower === query) return Option.some(0);
  if (lower.startsWith(query)) return Option.some(1);
  return lower.includes(query) ? Option.some(2) : Option.none();
};

/** The branch name a choice hands to `wt switch`. */
export const choiceName = (choice: Choice): string =>
  choice._tag === "Worktree" ? choice.branch : choice.name;

/** What a new branch starts from: wt's default branch, or the branch I'm on. */
export type Base = "default" | "current";

/**
 * What Enter asks the panel to run: switch to or create the choice's branch in the repo
 * `repo`. `current` is the branch I'm on; with none, the default branch is the base.
 */
export const enterAction = (
  repo: RepoId,
  choice: Choice,
  base: Base,
  current: Option.Option<string>,
): Action => ({
  _tag: "Create",
  machine: repo.machine,
  main: repo.root,
  name: choiceName(choice),
  base: base === "current" ? Option.getOrNull(current) : null,
});

/** The repos whose main checkout's folder name matches the typed text, best first. */
export const reposFor = (typed: string, repos: readonly RepoId[]): readonly RepoId[] =>
  ranked(repos, (repo) => lastSegment(repo.root), typed.trim().toLowerCase());

/**
 * What the dialog is for: `new` switches to or creates a worktree (New or open), `open`
 * picks one of the repo's worktrees to go to.
 */
export type DialogMode = "new" | "open";

/** What the panel opens the dialog with. */
export interface DialogProps {
  readonly mode: DialogMode;
  /** The repo; none asks me to pick one from `repos`. */
  readonly repo: Option.Option<RepoId>;
  /** The branch I'm on in that repo, offered as a base. */
  readonly branch: Option.Option<string>;
  /** The repos to pick from. */
  readonly repos: readonly RepoId[];
}

/** The dialog's state, all but what is typed. */
export interface DialogState {
  readonly mode: DialogMode;
  /** The repo it works in; none while I pick one. */
  readonly repo: Option.Option<RepoId>;
  /** The branch offered as a base: the one I'm on, in the repo the dialog opened on. */
  readonly current: Option.Option<string>;
  /** The repos to pick from. */
  readonly repos: readonly RepoId[];
  readonly worktrees: readonly Worktree[];
  readonly branches: readonly Branch[];
  /** Reading the repo's worktrees and branches. */
  readonly reading: boolean;
  /** Why they couldn't be read; typed names still work. */
  readonly error: Option.Option<string>;
  readonly base: Base;
  /** The highlighted line. */
  readonly at: number;
}

/** The dialog as it opens with `props`: reading its repo, unless it must ask for one. */
export const openDialog = (props: DialogProps): DialogState => ({
  mode: props.mode,
  repo: props.repo,
  current: props.branch,
  repos: props.repos,
  worktrees: [],
  branches: [],
  reading: Option.isSome(props.repo),
  error: Option.none(),
  base: "default",
  at: 0,
});

/** One line of the dialog: a repo to pick while it asks for one, else a choice. */
export type Line = { readonly _tag: "Repo"; readonly repo: RepoId } | Choice;

/** The most lines the dialog lists. */
export const LINE_LIMIT = 50;

/** The worktrees whose branch matches the typed text, best first, at most `limit`. */
const worktreesFor = (
  typed: string,
  worktrees: readonly Worktree[],
  limit: number,
): readonly Choice[] =>
  ranked(candidates(worktrees, []), choiceName, typed.trim().toLowerCase()).slice(
    0,
    Math.max(0, limit),
  );

/**
 * The dialog's lines for the typed text: repos while it asks for one, else choices: the
 * repo's worktrees when picking one to open, else worktrees and branches to switch to or
 * create.
 */
export const linesFor = (state: DialogState, typed: string): readonly Line[] =>
  Option.match(state.repo, {
    onNone: () => reposFor(typed, state.repos).map((repo): Line => ({ _tag: "Repo", repo })),
    onSome: () =>
      state.mode === "open"
        ? worktreesFor(typed, state.worktrees, LINE_LIMIT)
        : choicesFor(typed, state.worktrees, state.branches, LINE_LIMIT),
  });

/**
 * The dialog once its repo is read: the worktrees and branches, each read's failure
 * shown, the other still offered.
 */
export const withRead = (
  state: DialogState,
  list: Result.Result<readonly Worktree[], string>,
  branches: Result.Result<readonly Branch[], string>,
): DialogState => ({
  ...state,
  worktrees: Result.getOrElse(list, () => []),
  branches: Result.getOrElse(branches, () => []),
  reading: false,
  error: Option.liftPredicate(
    [Result.getFailure(list), Result.getFailure(branches)].flatMap(Option.toArray).join(" · "),
    (reasons) => reasons !== "",
  ),
});

/** The highlighted line's place among `lines`: never past the last one. */
export const highlight = (state: DialogState, lines: readonly Line[]): number =>
  Math.min(state.at, Math.max(0, lines.length - 1));

/** The highlight moved one line down (`1`) or up (`-1`), wrapping round the list. */
export const moved = (state: DialogState, lines: readonly Line[], step: 1 | -1): DialogState => {
  const count = Math.max(1, lines.length);
  return { ...state, at: (highlight(state, lines) + step + count) % count };
};

/** What was typed changed: the highlight goes back to the first line. */
export const retyped = (state: DialogState): DialogState => ({ ...state, at: 0 });

/** Tab: the other base, when there is a branch I'm on to offer. */
export const flippedBase = (state: DialogState): DialogState => ({
  ...state,
  base: state.base === "default" && Option.isSome(state.current) ? "current" : "default",
});

/** What taking a line does. */
export type Picked =
  /** A repo was picked: the dialog goes on in it, and reads it. */
  | { readonly _tag: "ReadRepo"; readonly state: DialogState; readonly repo: RepoId }
  /** A choice was taken: the dialog closes and the panel runs `action`. */
  | { readonly _tag: "Send"; readonly action: Action }
  /** Nothing to take. */
  | { readonly _tag: "Nothing" };

/** Enter or a click on `line`: picks the repo, or asks the panel to switch or create. */
export const pick = (state: DialogState, line: Option.Option<Line>): Picked => {
  if (Option.isNone(line)) return { _tag: "Nothing" };
  const taken = line.value;
  if (taken._tag === "Repo") {
    return {
      _tag: "ReadRepo",
      repo: taken.repo,
      // The branch I'm on belongs to the repo the dialog opened on, not a picked one.
      state: {
        ...state,
        repo: Option.some(taken.repo),
        current: Option.none(),
        reading: true,
        at: 0,
      },
    };
  }
  return Option.match(state.repo, {
    onNone: (): Picked => ({ _tag: "Nothing" }),
    onSome: (repo): Picked => ({
      _tag: "Send",
      action:
        state.mode === "open" && taken._tag === "Worktree"
          ? { _tag: "GoTo", machine: repo.machine, folder: taken.path, name: taken.branch }
          : enterAction(repo, taken, state.base, state.current),
    }),
  });
};

/** The dialog's title: what it is for, and the repo and machine it works in. */
export const dialogTitle = (state: DialogState): string => {
  const what = state.mode === "open" ? "Open a worktree" : "New or open worktree";
  const where = state.mode === "open" ? "of" : "in";
  return Option.match(state.repo, {
    onNone: () => `${what}: pick a repo`,
    onSome: ({ machine, root }) =>
      `${what} ${where} ${lastSegment(root)}${machine === THIS_MACHINE ? "" : ` on ${machine}`}`,
  });
};

/** The hint beside a repo the dialog offers: where it is, and on which machine. */
export const repoHint = ({ machine, root }: RepoId, home: string): string =>
  machine === THIS_MACHINE ? tildePath(root, home) : `${machine}: ${root}`;
