// The row and repo menus, the confirm dialog's text and what each action asks for.
// Pure: no `herdr` or `gpui` imports. The shell (main.ts) draws these and runs the actions.
import { Option } from "effect";
import {
  cleanupScript,
  mergeScript,
  removeScript,
  type Batch,
  type Linked,
  type MergeMode,
  type WtOptions,
} from "./commands.ts";
import type { RepoList } from "./reads.ts";
import { lastSegment } from "./settings.ts";
import type { Click } from "./view.ts";
import type { Worktree } from "./worktrees.ts";

/**
 * Everything a menu item, a button or a dialog can ask the panel to do. Plain data, so it
 * can travel from an overlay to the panel through shared state.
 */
export type Action =
  | { readonly _tag: "Open"; readonly click: Click }
  | {
      readonly _tag: "Merge";
      readonly target: Linked;
      readonly mode: MergeMode;
      readonly dirty: boolean;
    }
  /** `target.branch` is the worktree's folder when it has no branch. */
  | { readonly _tag: "Remove"; readonly target: Linked; readonly dirty: boolean }
  | {
      readonly _tag: "Cleanup";
      readonly batches: readonly Batch[];
      /** The worktrees' folders, to close their spaces once they are gone. */
      readonly paths: readonly string[];
      /** How many of them have uncommitted changes. */
      readonly dirty: number;
    }
  /** Ask for a branch name, for a new worktree in the repo at `main`. */
  | { readonly _tag: "New"; readonly main: string }
  /** Switch to or create the worktree for `name`; `base` null for wt's default branch. */
  | {
      readonly _tag: "Create";
      readonly main: string;
      readonly name: string;
      readonly base: string | null;
    }
  | { readonly _tag: "CopyPath"; readonly path: string }
  | { readonly _tag: "Reveal"; readonly path: string }
  | { readonly _tag: "Refresh" }
  | { readonly _tag: "Hide"; readonly root: string }
  /** Open the Settings dialog. */
  | { readonly _tag: "Settings" };

export type CleanupAction = Extract<Action, { readonly _tag: "Cleanup" }>;

export interface MenuItem {
  readonly label: string;
  /** Drawn in the theme's red: the action removes something. */
  readonly danger: boolean;
  readonly action: Action;
}

const item = (label: string, action: Action, danger = false): MenuItem => ({
  label,
  danger,
  action,
});

const mergeOf = (root: string, worktree: Worktree, branch: string, mode: MergeMode): Action => ({
  _tag: "Merge",
  target: { main: root, path: worktree.path, branch },
  mode,
  dirty: worktree.dirty,
});

/** Removing a linked worktree: by its branch, or by its folder when it has none. */
const removeOf = (root: string, worktree: Worktree): Action => ({
  _tag: "Remove",
  target: {
    main: root,
    path: worktree.path,
    branch: Option.getOrElse(worktree.branch, () => worktree.path),
  },
  dirty: worktree.dirty,
});

/** The right-click menu of a worktree in the repo whose main checkout is `root`. */
export const rowMenu = (root: string, worktree: Worktree, click: Click): readonly MenuItem[] => {
  const remove = item("Remove…", removeOf(root, worktree), true);
  const linked =
    worktree.state._tag === "Main"
      ? []
      : Option.match(worktree.branch, {
          onNone: () => [remove],
          onSome: (branch) => [
            item("Merge into main (squash)", mergeOf(root, worktree, branch, "squash")),
            item("Merge, keeping every commit", mergeOf(root, worktree, branch, "keep")),
            remove,
          ],
        });
  return [
    item("Open", { _tag: "Open", click }),
    ...linked,
    item("Copy path", { _tag: "CopyPath", path: worktree.path }),
    item("Reveal in Finder", { _tag: "Reveal", path: worktree.path }),
  ];
};

/** One menu row's height, in px. */
export const ITEM_HEIGHT = 30;
/** The menu's title line plus its padding, in px. */
export const MENU_CHROME = 40;

/** A menu's height for `items` rows. */
export const menuHeight = (items: number): number => MENU_CHROME + items * ITEM_HEIGHT;

/** One repo's worktrees, as the clean-up reads them. */
export interface RepoWorktrees {
  readonly root: string;
  readonly worktrees: readonly Worktree[];
}

/** Removing every merged worktree of `repos`, batched by repo; none when there are none. */
export const cleanupAction = (repos: readonly RepoWorktrees[]): Option.Option<CleanupAction> => {
  const found = repos.flatMap(({ root, worktrees }) => {
    const merged = worktrees.filter((w) => w.state._tag === "Merged");
    return merged.length === 0 ? [] : [{ root, merged }];
  });
  if (found.length === 0) return Option.none();
  const all = found.flatMap(({ merged }) => merged);
  return Option.some({
    _tag: "Cleanup",
    batches: found.map(({ root, merged }) => ({
      main: root,
      branches: merged.map((w) => Option.getOrElse(w.branch, () => w.path)),
    })),
    paths: all.map((w) => w.path),
    dirty: all.filter((w) => w.dirty).length,
  });
};

/** The right-click menu of the repo whose main checkout is `root`. */
export const repoMenu = (root: string, worktrees: readonly Worktree[]): readonly MenuItem[] => [
  item("New worktree…", { _tag: "New", main: root }),
  ...Option.toArray(cleanupAction([{ root, worktrees }])).map((action) =>
    item(`Clean up ${action.paths.length} merged…`, action, true),
  ),
  item("Refresh", { _tag: "Refresh" }),
  item("Reveal in Finder", { _tag: "Reveal", path: root }),
  item("Hide this repo", { _tag: "Hide", root }),
];

/** A worktree found in the panel's lists, with its repo's main checkout. */
export interface FoundWorktree {
  readonly root: string;
  readonly worktree: Worktree;
}

/** The worktree at `path` in any repo's list (`lists`, by main checkout). */
export const findWorktree = (
  lists: ReadonlyMap<string, RepoList>,
  path: string,
): Option.Option<FoundWorktree> =>
  Option.fromNullishOr(
    Array.from(lists).flatMap(([root, list]) =>
      list.worktrees.filter((w) => w.path === path).map((worktree) => ({ root, worktree })),
    )[0],
  );

/**
 * Removing the merged worktrees among those at `paths`, batched by repo in the order
 * their repos first appear; none when none of them is merged.
 */
export const cleanupFor = (
  lists: ReadonlyMap<string, RepoList>,
  paths: readonly string[],
): Option.Option<CleanupAction> => {
  const found = paths.flatMap((path) => Option.toArray(findWorktree(lists, path)));
  const roots = Array.from(new Set(found.map(({ root }) => root)));
  return cleanupAction(
    roots.map((root) => ({
      root,
      worktrees: found.filter((f) => f.root === root).map((f) => f.worktree),
    })),
  );
};

export interface Confirm {
  readonly title: string;
  readonly lines: readonly string[];
  /** The button that goes ahead. */
  readonly go: string;
  /** The go button is red. */
  readonly danger: boolean;
}

const DIRTY_LINE = "It has uncommitted changes: wt stops rather than lose them.";
const SPACES_LINE = "Spaces open on a removed worktree close.";

/** What to ask before `action`; none for actions that remove or merge nothing. */
export const confirmFor = (action: Action): Option.Option<Confirm> => {
  switch (action._tag) {
    case "Merge":
      return Option.some({
        title: `Merge ${action.target.branch} into main?`,
        lines: [
          action.mode === "squash"
            ? "Its commits become one commit on main."
            : "Every commit is kept, rebased onto main.",
          "Then the worktree is removed, and its branch with it.",
          ...(action.dirty ? ["Its uncommitted changes are committed first."] : []),
          SPACES_LINE,
        ],
        go: "Merge",
        danger: false,
      });
    case "Remove":
      return Option.some({
        title: `Remove ${
          action.target.branch === action.target.path
            ? lastSegment(action.target.path)
            : action.target.branch
        }?`,
        lines: [
          "The worktree's folder is removed; its branch too, if it is merged.",
          ...(action.dirty ? [DIRTY_LINE] : []),
          SPACES_LINE,
        ],
        go: "Remove",
        danger: true,
      });
    case "Cleanup": {
      const count = action.batches.reduce((n, batch) => n + batch.branches.length, 0);
      return Option.some({
        title: `Remove ${count} merged worktree${count === 1 ? "" : "s"}?`,
        lines: [
          ...action.batches.map((b) => `${lastSegment(b.main)}: ${b.branches.join(", ")}`),
          ...(action.dirty > 0
            ? [`${action.dirty} with uncommitted changes: wt stops rather than lose them.`]
            : []),
          SPACES_LINE,
        ],
        go: "Remove",
        danger: true,
      });
    }
    default:
      return Option.none();
  }
};

/** The confirm dialog's height for `lines` lines of text, in px, never taller than 560. */
export const dialogHeight = (lines: number): number => Math.min(560, 132 + lines * 22);

/** A job to run in a terminal window: what the shell needs from an action. */
export interface JobSpec {
  /** Shown in the job window's title bar and the panel's Running line. */
  readonly title: string;
  readonly cwd: string;
  /** The script, for the person's shell. */
  readonly body: string;
  /** Folders the job removes: spaces left on them are closed once they are gone. */
  readonly gone: readonly string[];
}

/** The job for `action`; none for actions that aren't jobs (Create is built with its temp file). */
export const jobFor = (action: Action, options: WtOptions): Option.Option<JobSpec> => {
  switch (action._tag) {
    case "Merge":
      return Option.some({
        title: `Merge ${action.target.branch} into main`,
        cwd: action.target.main,
        body: mergeScript(action.target, action.mode, options),
        gone: [action.target.path],
      });
    case "Remove":
      return Option.some({
        title: `Remove ${action.target.branch}`,
        cwd: action.target.main,
        body: removeScript(action.target.main, [action.target.branch], options),
        gone: [action.target.path],
      });
    case "Cleanup":
      return Option.map(Option.fromNullishOr(action.batches[0]), (first) => ({
        title: `Clean up ${action.paths.length} merged`,
        cwd: first.main,
        body: cleanupScript(action.batches, options),
        gone: action.paths,
      }));
    default:
      return Option.none();
  }
};

/** A toast's text. */
export interface Notice {
  readonly title: string;
  readonly body: string;
}

/** What to say when a job is asked for while `running` (its title) still runs. */
export const busyNotice = (running: string): Notice => ({
  title: "worktrunk is busy",
  body: `Wait for "${running}" to finish.`,
});
