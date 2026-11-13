// The row and repo menus, the confirm dialog's text and what each action asks for.
// Pure: no `herdr` or `gpui` imports. The shell (main.ts) draws these and runs the actions.
import { Option, Result } from "effect";
import type { MenuRequest, SpaceAct } from "worktrunk-mailbox";
import {
  cleanupScript,
  mergeScript,
  removeScript,
  type Batch,
  type Linked,
  type MergeMode,
  type WtOptions,
} from "./commands.ts";
import {
  machineName,
  repoKey,
  repoOfKey,
  type RepoKey,
  THIS_MACHINE,
  type Located,
  type Machine,
  type RepoId,
} from "./machines.ts";
import type { RepoList } from "./reads.ts";
import { isUnder } from "./repos.ts";
import { lastSegment } from "./settings.ts";
import type { Place } from "./spaces.ts";
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
      /** How many of them have uncommitted changes. */
      readonly dirty: number;
    }
  /**
   * `NewOrOpen`: open the New-or-open worktree dialog for the repo `folder` is in (its
   * main checkout, a linked worktree or any folder inside one, whose branch is offered as
   * a base; null for the focused folder). `SpaceWorktree`: act on a space's worktree.
   * Other mods post these too (`worktrunk-mailbox`).
   */
  | MenuRequest
  /** Open the New-or-open worktree dialog for the repo `at` is in, on its machine. */
  | { readonly _tag: "NewOrOpenAt"; readonly at: Located }
  /**
   * Go to the worktree at `folder` on `machine`: select the space on it, else open a new
   * space named `name` there.
   */
  | {
      readonly _tag: "GoTo";
      readonly machine: Machine;
      readonly folder: string;
      readonly name: string;
    }
  /**
   * Switch to or create the worktree for `name` in the repo at `main` on `machine`;
   * `base` null for wt's default branch.
   */
  | {
      readonly _tag: "Create";
      readonly machine: Machine;
      readonly main: string;
      readonly name: string;
      readonly base: string | null;
    }
  | { readonly _tag: "CopyPath"; readonly path: string }
  | { readonly _tag: "Reveal"; readonly path: string }
  | { readonly _tag: "Refresh" }
  | { readonly _tag: "Hide"; readonly machine: Machine; readonly root: string }
  /** Open the Settings dialog. */
  | { readonly _tag: "Settings" }

  /** Give the panel the keyboard, in its search box. */
  | { readonly _tag: "Focus" };

export type CleanupAction = Extract<Action, { readonly _tag: "Cleanup" }>;

export type CreateAction = Extract<Action, { readonly _tag: "Create" }>;

/** How many worktrees `batches` remove. */
const removedBy = (batches: readonly Batch[]): number =>
  batches.reduce((n, batch) => n + batch.paths.length, 0);

/** How many worktrees a clean up removes. */
export const cleanupCount = (action: CleanupAction): number => removedBy(action.batches);

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

/** "Reveal in Finder" for a folder on `machine`: only this machine's Finder can show it. */
const revealOn = (machine: Machine, path: string): readonly MenuItem[] =>
  machine === THIS_MACHINE ? [item("Reveal in Finder", { _tag: "Reveal", path })] : [];

const mergeOf = (
  { machine, root }: RepoId,
  worktree: Worktree,
  branch: string,
  mode: MergeMode,
): Action => ({
  _tag: "Merge",
  target: { machine, main: root, path: worktree.path, branch },
  mode,
  dirty: worktree.dirty,
});

/** Removing a linked worktree: by its branch, or by its folder when it has none. */
const removeOf = ({ machine, root }: RepoId, worktree: Worktree): Action => ({
  _tag: "Remove",
  target: {
    machine,
    main: root,
    path: worktree.path,
    branch: Option.getOrElse(worktree.branch, () => worktree.path),
  },
  dirty: worktree.dirty,
});

/** The right-click menu of a worktree of `repo`. */
export const rowMenu = (repo: RepoId, worktree: Worktree, click: Click): readonly MenuItem[] => {
  const remove = item("Remove…", removeOf(repo, worktree), true);
  const linked =
    worktree.state._tag === "Main"
      ? []
      : Option.match(worktree.branch, {
          onNone: () => [remove],
          onSome: (branch) => [
            item("Merge into main (squash)", mergeOf(repo, worktree, branch, "squash")),
            item("Merge, keeping every commit", mergeOf(repo, worktree, branch, "keep")),
            remove,
          ],
        });
  return [
    item("Open", { _tag: "Open", click }),
    ...linked,
    item("Copy path", { _tag: "CopyPath", path: worktree.path }),
    ...revealOn(repo.machine, worktree.path),
  ];
};

/**
 * Merging (squashed) or removing the worktree of `repo` that holds `folder` (on the
 * repo's machine), as a space's menu asks: the deepest of `worktrees` containing it.
 * Fails, saying why, for the main checkout, a detached worktree's merge, or a folder in
 * none of them.
 */
export const spaceWorktreeAction = (
  act: "Merge" | "Remove",
  repo: RepoId,
  worktrees: readonly Worktree[],
  folder: string,
): Result.Result<Action, string> => {
  const root = repo.root;
  const holder = worktrees
    .filter((w) => isUnder(folder, w.path))
    .reduce<Worktree | undefined>(
      (best, w) => (best && best.path.length >= w.path.length ? best : w),
      undefined,
    );
  if (holder === undefined) {
    return Result.fail(`${folder} isn't in a worktree of ${lastSegment(root)}.`);
  }
  if (holder.state._tag === "Main") {
    return Result.fail(`${lastSegment(root)}'s main checkout can't be merged or removed.`);
  }
  if (act === "Remove") return Result.succeed(removeOf(repo, holder));
  return Option.match(holder.branch, {
    onNone: () => Result.fail(`${lastSegment(holder.path)} has no branch to merge.`),
    onSome: (branch) => Result.succeed(mergeOf(repo, holder, branch, "squash")),
  });
};

/** One menu row's height, in px. */
export const ITEM_HEIGHT = 30;
/** The menu's title line plus its padding, in px. */
export const MENU_CHROME = 40;

/** A menu's height for `items` rows. */
export const menuHeight = (items: number): number => MENU_CHROME + items * ITEM_HEIGHT;

/** One repo's worktrees, as the clean-up reads them. */
export interface RepoWorktrees extends RepoId {
  readonly worktrees: readonly Worktree[];
}

/** Removing every merged worktree of `repos`, batched by repo; none when there are none. */
export const cleanupAction = (repos: readonly RepoWorktrees[]): Option.Option<CleanupAction> => {
  const found = repos.flatMap(({ machine, root, worktrees }) => {
    const merged = worktrees.filter((w) => w.state._tag === "Merged");
    return merged.length === 0 ? [] : [{ machine, root, merged }];
  });
  if (found.length === 0) return Option.none();
  const all = found.flatMap(({ merged }) => merged);
  return Option.some({
    _tag: "Cleanup",
    batches: found.map(({ machine, root, merged }) => ({
      machine,
      main: root,
      branches: merged.map((w) => Option.getOrElse(w.branch, () => w.path)),
      paths: merged.map((w) => w.path),
    })),
    dirty: all.filter((w) => w.dirty).length,
  });
};

/** The right-click menu of `repo`. */
export const repoMenu = (
  { machine, root }: RepoId,
  worktrees: readonly Worktree[],
): readonly MenuItem[] => [
  item("New or open worktree…", { _tag: "NewOrOpenAt", at: { machine, folder: root } }),
  ...Option.toArray(cleanupAction([{ machine, root, worktrees }])).map((action) =>
    item(`Clean up ${cleanupCount(action)} merged…`, action, true),
  ),
  item("Refresh", { _tag: "Refresh" }),
  ...revealOn(machine, root),
  item("Hide this repo", { _tag: "Hide", machine, root }),
];

/** A worktree found in the panel's lists, with its repo's machine and main checkout. */
export interface FoundWorktree extends RepoId {
  readonly worktree: Worktree;
}

/**
 * The worktree a row's key names (its machine and path, as `repoKey` keys a folder) in
 * any list of a repo on that machine (`lists`, by `repoKey`).
 */
export const findWorktree = (
  lists: ReadonlyMap<RepoKey, RepoList>,
  key: RepoKey,
): Option.Option<FoundWorktree> => {
  const { machine, root: path } = repoOfKey(key);
  return Option.fromNullishOr(
    Array.from(lists)
      .map(([listKey, list]) => ({ repo: repoOfKey(listKey), list }))
      .filter(({ repo }) => repo.machine === machine)
      .flatMap(({ repo, list }) =>
        list.worktrees.filter((w) => w.path === path).map((worktree) => ({ ...repo, worktree })),
      )[0],
  );
};

/**
 * Removing the merged worktrees among those the row `keys` name (see `findWorktree`),
 * batched by repo (machine and folder) in the order their repos first appear; none when
 * none of them is merged.
 */
export const cleanupFor = (
  lists: ReadonlyMap<RepoKey, RepoList>,
  keys: readonly RepoKey[],
): Option.Option<CleanupAction> => {
  const found = keys.flatMap((key) => Option.toArray(findWorktree(lists, key)));
  const repos = Array.from(
    new Map(
      found.map((f): [RepoKey, RepoId] => [repoKey(f), { machine: f.machine, root: f.root }]),
    ),
  );
  return cleanupAction(
    repos.map(([key, repo]) => ({
      ...repo,
      worktrees: found.filter((f) => repoKey(f) === key).map((f) => f.worktree),
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
      const count = cleanupCount(action);
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
  /** The machine it runs on: its repo's. `cwd` and `gone` are folders there. */
  readonly on: Machine;
}

/** The clean up of `batches`, all on `machine`, as one job; none for no batches. */
const cleanupJob = (
  batches: readonly Batch[],
  machine: Machine,
  title: string,
  options: WtOptions,
): readonly JobSpec[] =>
  Option.toArray(
    Option.map(Option.fromNullishOr(batches[0]), (first) => ({
      title,
      cwd: first.main,
      body: cleanupScript(batches, options),
      gone: batches.flatMap((batch) => batch.paths),
      on: machine,
    })),
  );

/**
 * The jobs for `action`, in the order they run; none for actions that aren't jobs
 * (Create is built with its temp file). Each job runs on its repo's machine. A job runs
 * on one machine, so a clean up is one job per machine its repos are on, in the order the
 * machines first appear, each named after its machine when there are several.
 */
export const jobsFor = (action: Action, options: WtOptions): readonly JobSpec[] => {
  switch (action._tag) {
    case "Merge":
      return [
        {
          title: `Merge ${action.target.branch} into main`,
          cwd: action.target.main,
          body: mergeScript(action.target, action.mode, options),
          gone: [action.target.path],
          on: action.target.machine,
        },
      ];
    case "Remove":
      return [
        {
          title: `Remove ${action.target.branch}`,
          cwd: action.target.main,
          body: removeScript(action.target.main, [action.target.branch], options),
          gone: [action.target.path],
          on: action.target.machine,
        },
      ];
    case "Cleanup": {
      const machines = Array.from(new Set(action.batches.map((batch) => batch.machine)));
      return machines.flatMap((machine) => {
        const batches = action.batches.filter((batch) => batch.machine === machine);
        const where = machines.length > 1 ? ` on ${machineName(machine)}` : "";
        return cleanupJob(
          batches,
          machine,
          `Clean up ${removedBy(batches)} merged${where}`,
          options,
        );
      });
    }
    default:
      return [];
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

/** What the panel does for a space menu's request, once it knows where the space is. */
export type SpaceStep =
  /** The space has no folder anywhere: nothing to act on. */
  | { readonly _tag: "NoFolder" }
  /** Open the New-or-open dialog (`new`) or the worktree picker (`open`) for `at`'s repo. */
  | { readonly _tag: "Dialog"; readonly mode: "new" | "open"; readonly at: Located }
  /** Merge or remove the worktree holding `at`, found through its repo on its machine. */
  | { readonly _tag: "Act"; readonly act: "Merge" | "Remove"; readonly at: Located };

/** The step for `act` on the space `space`, from where every space is now (`places`). */
export const spaceStep = (places: readonly Place[], space: string, act: SpaceAct): SpaceStep =>
  Option.match(Option.fromNullishOr(places.find((p) => p.space.id === space)), {
    onNone: (): SpaceStep => ({ _tag: "NoFolder" }),
    onSome: ({ machine, place }): SpaceStep => {
      const at: Located = { machine, folder: place };
      switch (act) {
        case "NewOrOpen":
          return { _tag: "Dialog", mode: "new", at };
        case "Open":
          return { _tag: "Dialog", mode: "open", at };
        default:
          return { _tag: "Act", act, at };
      }
    },
  });
