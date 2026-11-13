// What the panel draws, from one snapshot of everything it knows. Pure: no `herdr` or
// `gpui` imports, so the shell (main.ts) only turns this into elements.
import { Option } from "effect";
import {
  locatedLabel,
  machineName,
  repoKey,
  type RepoKey,
  THIS_MACHINE,
  type Machine,
  type MachineStatus,
} from "./machines.ts";
import type { CiRead, CurrentRepo, RepoList } from "./reads.ts";
import { OTHER, type Repo } from "./repos.ts";
import { lastSegment, type Settings } from "./settings.ts";
import {
  spacePlaces,
  spacesOnWorktrees,
  type PaneLike,
  type Place,
  type SpaceLike,
  type SpaceRef,
} from "./spaces.ts";
import type { Ci, CiStatus, Worktree } from "./worktrees.ts";

/**
 * The panel's views: the Repos tree, one flat list of worktrees by what to do next, or
 * the Current repo alone.
 */
export type Show = "repos" | "merged" | "active" | "conflict" | "open" | "current";

/** Every view, in the picker's order, with its label. */
export const SHOWS: readonly (readonly [Show, string])[] = [
  ["current", "Current"],
  ["repos", "Repos"],
  ["merged", "Clean up"],
  ["active", "Active"],
  ["conflict", "Conflicts"],
  ["open", "Open"],
];

/** How the list is sliced; remembered across restarts. */
export interface ViewState {
  /** The group filter: the one group in view; none for All. */
  readonly group: Option.Option<string>;
  readonly show: Show;
  /** "With worktrees": the Repos view hides repos with only a main checkout. */
  readonly only: boolean;
  /** The machine filter: the one machine in view; none for All. */
  readonly machine: Option.Option<Machine>;
}

export const DEFAULT_VIEW_STATE: ViewState = {
  group: Option.none(),
  show: "repos",
  only: true,
  machine: Option.none(),
};

export interface Snapshot {
  /** The repos to list, in order. */
  readonly repos: readonly Repo[];
  /** The first folder scan has finished. */
  readonly discovered: boolean;
  readonly loading: boolean;
  /** Each repo's list by its `repoKey`; a repo missing here hasn't been read yet. */
  readonly lists: ReadonlyMap<RepoKey, RepoList>;
  readonly settings: Settings;
  readonly settingsError: Option.Option<string>;
  /** Why the last search for repos (folder scan, open spaces' repos) failed, if it did. */
  readonly discoverError: Option.Option<string>;
  /** The group folders the last scan found missing, as it scanned them. */
  readonly missingFolders: readonly string[];
  /** The machines that can't be read now, and why: each gets one line, and its repos none. */
  readonly machines: ReadonlyMap<Machine, MachineStatus>;
  /** The settings file's name, for the empty-state hint. */
  readonly settingsFile: string;
  readonly spaces: readonly SpaceLike[];
  readonly panes: readonly PaneLike[];
  /** Folded repos (by `repoKey`) and groups (by `<repoKey>|<kind>`). */
  readonly folded: Readonly<Record<string, boolean>>;
  /** Each repo's CI by its `repoKey`; CI is read less often than the list. */
  readonly ci: ReadonlyMap<RepoKey, CiRead>;
  readonly view: ViewState;
  /** The search box's text. */
  readonly search: string;
  /** The focused folder's repo, for the Current view. */
  readonly current: CurrentRepo;
  /** ms since the epoch, for commit ages. */
  readonly now: number;
}

/** The dot's colour: the theme's accent, done, working and blocked colours. */
export type Tone = "main" | "merged" | "active" | "conflict";

export type Click =
  | { readonly _tag: "Select"; readonly space: string }
  /** A new space named `name` at `folder` on `machine` (null: this machine). */
  | {
      readonly _tag: "New";
      readonly name: string;
      readonly folder: string;
      readonly machine: Machine;
    };

/** A row's CI badge; `stale` when the checks ran on an older commit than the one pushed. */
export interface CiBadge {
  readonly status: CiStatus | "conflicts" | "unknown";
  readonly stale: boolean;
}

const CI_TOOLTIPS: Readonly<Record<CiBadge["status"], string>> = {
  passed: "CI passed",
  running: "CI is running",
  failed: "CI failed",
  conflicts: "Conflicts with main",
  unknown: "No CI status",
};

/** What a row's CI badge means, for its hover label. */
export const ciTooltip = (badge: CiBadge): string =>
  badge.stale
    ? `${CI_TOOLTIPS[badge.status]} on an older commit than the one pushed`
    : CI_TOOLTIPS[badge.status];

/** Hover labels for a row's status marks; none where the mark isn't drawn. */
export interface RowTooltips {
  /** The dot before the branch name: its state, and whether a space sits on it. */
  readonly dot: string;
  readonly badge: Option.Option<string>;
  readonly dirty: Option.Option<string>;
  readonly open: Option.Option<string>;
  readonly ci: Option.Option<string>;
}

export interface RowView {
  /**
   * The worktree's machine and path, as `repoKey` keys a folder: unique, so also the
   * element id.
   */
  readonly key: RepoKey;
  /** Its repo's root. */
  readonly repo: string;
  readonly label: string;
  readonly tone: Tone;
  /** No space sits on it. */
  readonly hollow: boolean;
  /** Uncommitted changes. */
  readonly dirty: boolean;
  /** A space sits on it. */
  readonly open: boolean;
  /** Its space is the shown one. */
  readonly current: boolean;
  /** The line under the branch name. */
  readonly subline: string;
  /** A word beside the branch name: "new" for a New worktree. */
  readonly badge: Option.Option<string>;
  /** None when CI wasn't asked for, or there is no PR and no checks. */
  readonly ci: Option.Option<CiBadge>;
  readonly tips: RowTooltips;
  readonly click: Click;
}

export type SectionKind = "merged" | "active" | "conflict";

export interface SectionView {
  /** `<repoKey>|<kind>`: unique, and its fold key. */
  readonly key: string;
  readonly kind: SectionKind;
  readonly label: string;
  readonly count: number;
  readonly folded: boolean;
  /** Empty while folded. */
  readonly rows: readonly RowView[];
}

export type RepoStatus =
  | { readonly _tag: "Reading" }
  | { readonly _tag: "Ok" }
  | { readonly _tag: "Error"; readonly text: string };

export interface RepoView {
  /** The repo's `repoKey`: unique, and its fold key. */
  readonly key: RepoKey;
  readonly name: string;
  /** The machine it is on, shown only while the list holds repos on more than one. */
  readonly machine: Option.Option<string>;
  /** Its group, none for Other. */
  readonly group: Option.Option<string>;
  /** How many worktrees, none before the first read. */
  readonly count: Option.Option<number>;
  readonly status: RepoStatus;
  /** The latest CI read failed, so the CI shown is older. */
  readonly ciNote: Option.Option<string>;
  readonly folded: boolean;
  /** Its header folds it; the Current view's one repo always stays open. */
  readonly foldable: boolean;
  /** Empty while folded. */
  readonly main: readonly RowView[];
  readonly sections: readonly SectionView[];
}

export type Body =
  | { readonly _tag: "Message"; readonly text: string }
  /** The Current view outside every repo: `text`, then the Open view's list. */
  | { readonly _tag: "NotInRepo"; readonly text: string; readonly open: Body }
  | { readonly _tag: "Tree"; readonly repos: readonly RepoView[] }
  /** One list across repos, newest first; `summary` heads the Clean up view. */
  | {
      readonly _tag: "Flat";
      readonly summary: Option.Option<string>;
      readonly rows: readonly RowView[];
    };

export interface ShowOption {
  readonly show: Show;
  readonly label: string;
  readonly selected: boolean;
}

/** One choice in the group filter. */
export interface Chip {
  readonly label: string;
  /** The group it selects; none for All. */
  readonly group: Option.Option<string>;
  readonly selected: boolean;
}

/** One choice in the machine filter. */
export interface MachineChoice {
  readonly label: string;
  /** The machine it keeps in view; none for All. */
  readonly machine: Option.Option<Machine>;
  readonly selected: boolean;
}

export interface PanelView {
  /** Show the spinner. */
  readonly loading: boolean;
  /** The spinner's hover label, while it shows. */
  readonly spinnerTip: Option.Option<string>;
  /** The machine filter: All, then each machine. */
  readonly machineFilter: readonly MachineChoice[];
  /** The group filter: All, then one per group. */
  readonly chips: readonly Chip[];
  /** The view picker. */
  readonly views: readonly ShowOption[];
  /** The All repos / With worktrees toggle (true: With worktrees); Repos view only. */
  readonly toggle: Option.Option<boolean>;
  /** Lines across the top, for what went wrong outside any one repo. */
  readonly banners: readonly string[];
  readonly body: Body;
}

const SECTIONS: readonly (readonly [SectionKind, string])[] = [
  ["merged", "Merged · ready to clean up"],
  ["active", "In progress"],
  ["conflict", "Conflicts with main"],
];

/** The section a worktree goes in; none for the main checkout, which comes first. */
const kindOf = (worktree: Worktree): Option.Option<SectionKind> => {
  switch (worktree.state._tag) {
    case "Main":
      return Option.none();
    case "Merged":
      return Option.some("merged");
    case "New":
    case "Active":
      return Option.some("active");
    case "Conflict":
      return Option.some("conflict");
  }
};

/** How long ago, shortest unit: 5m, 3h, 2d, 4mo. */
const age = (at: number, now: number): string => {
  const seconds = Math.max(0, (now - at) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 86400 * 60) return `${Math.round(seconds / 86400)}d`;
  return `${Math.round(seconds / 86400 / 30)}mo`;
};

const mainParts = (worktree: Worktree): readonly string[] => {
  const sync = Option.match(worktree.upstream, {
    onNone: () => [],
    onSome: (up) => [
      ...(up.behind > 0 ? [`↓${up.behind} behind remote`] : []),
      ...(up.ahead > 0 ? [`↑${up.ahead} to push`] : []),
    ],
  });
  return sync.length > 0 ? sync : ["main checkout"];
};

const workParts = (worktree: Worktree): readonly string[] => {
  const { ahead, behind, added, deleted, upstream } = worktree;
  const remoteBehind = Option.getOrElse(
    Option.map(upstream, (up) => up.behind),
    () => 0,
  );
  return [
    `↑${ahead} ↓${behind} vs main`,
    ...(added > 0 || deleted > 0 ? [`+${added} −${deleted}`] : []),
    ...(remoteBehind > 0 ? [`↓${remoteBehind} remote`] : []),
  ];
};

const MERGE_REASONS: Readonly<Record<string, string>> = {
  trees_match: "same files as main",
  patch_id_match: "squash-merged",
  ancestor: "in main's history",
};

const stateParts = (worktree: Worktree): readonly string[] => {
  const { state } = worktree;
  switch (state._tag) {
    case "Main":
      return mainParts(worktree);
    case "Merged":
      return [
        Option.getOrElse(
          Option.flatMap(state.reason, (r) => Option.fromNullishOr(MERGE_REASONS[r])),
          () => "merged",
        ),
      ];
    default:
      return workParts(worktree);
  }
};

/** The line under a row's branch name. */
const subline = (worktree: Worktree, now: number): string =>
  [
    ...stateParts(worktree),
    ...(worktree.dirty ? ["uncommitted changes"] : []),
    ...Option.toArray(Option.map(worktree.committedAt, (at) => age(at, now))),
  ].join(" · ");

const badgeOf = (ci: Ci): Option.Option<CiBadge> => {
  switch (ci._tag) {
    case "NotAsked":
    case "None":
      return Option.none();
    case "Checks":
      return Option.some({ status: ci.status, stale: ci.stale });
    case "Conflicts":
      return Option.some({ status: "conflicts", stale: false });
    case "Unknown":
      return Option.some({ status: "unknown", stale: false });
  }
};

/** The worktree's CI: from its repo's last CI read, else whatever its list carried. */
const ciOf = (snapshot: Snapshot, repo: Repo, worktree: Worktree): Ci =>
  Option.getOrElse(
    Option.fromNullishOr(snapshot.ci.get(repoKey(repo))?.byPath.get(worktree.path)),
    () => worktree.ci,
  );

const TONE_TOOLTIPS: Readonly<Record<Tone, string>> = {
  main: "Main checkout",
  merged: "Merged",
  active: "In progress",
  conflict: "Conflicts with main",
};

const dotTooltip = (tone: Tone, open: boolean): string =>
  `${TONE_TOOLTIPS[tone]} · ${open ? "open in a space" : "no space open"}`;

/** The hover label of the open marker: names the space's machine when it isn't this one. */
const openTooltip = (machine: Machine): string =>
  machine === THIS_MACHINE ? "Open in a space" : `Open in a space on ${machineName(machine)}`;

const rowView = (
  snapshot: Snapshot,
  repo: Repo,
  worktree: Worktree,
  space: Option.Option<SpaceRef>,
): RowView => {
  const tone = Option.getOrElse(kindOf(worktree), (): Tone => "main");
  const isNew = worktree.state._tag === "New";
  const ci = badgeOf(ciOf(snapshot, repo, worktree));
  return {
    key: repoKey({ machine: repo.machine, root: worktree.path }),
    repo: repo.root,
    label: Option.getOrElse(worktree.branch, () => "(detached)"),
    tone,
    hollow: Option.isNone(space),
    dirty: worktree.dirty,
    open: Option.isSome(space),
    current: Option.exists(space, (s) => s.active),
    subline: subline(worktree, snapshot.now),
    badge: isNew ? Option.some("new") : Option.none(),
    ci,
    tips: {
      dot: dotTooltip(tone, Option.isSome(space)),
      badge: isNew ? Option.some("No commits or changes yet") : Option.none(),
      dirty: worktree.dirty ? Option.some("Uncommitted changes") : Option.none(),
      open: Option.map(space, () => openTooltip(repo.machine)),
      ci: Option.map(ci, ciTooltip),
    },
    click: Option.match(space, {
      onNone: (): Click => ({
        _tag: "New",
        name:
          worktree.state._tag === "Main"
            ? lastSegment(repo.root)
            : Option.getOrElse(worktree.branch, () => lastSegment(worktree.path)),
        folder: worktree.path,
        machine: repo.machine,
      }),
      onSome: (s): Click => ({ _tag: "Select", space: s.id }),
    }),
  };
};

const newestFirst = (a: Worktree, b: Worktree): number =>
  Option.getOrElse(b.committedAt, () => 0) - Option.getOrElse(a.committedAt, () => 0);

const statusOf = (list: Option.Option<RepoList>): RepoStatus =>
  Option.match(list, {
    onNone: (): RepoStatus => ({ _tag: "Reading" }),
    onSome: (l) =>
      Option.match(l.error, {
        onNone: (): RepoStatus => ({ _tag: "Ok" }),
        onSome: (text): RepoStatus => ({ _tag: "Error", text }),
      }),
  });

const listOf = (snapshot: Snapshot, repo: Repo): Option.Option<RepoList> =>
  Option.fromNullishOr(snapshot.lists.get(repoKey(repo)));

/** How many worktrees: wt list's answer once read, else the scan's. */
const countOf = (repo: Repo, list: Option.Option<RepoList>): number =>
  Option.match(list, {
    onNone: () => repo.count,
    onSome: (l) => (l.worktrees.length > 0 ? l.worktrees.length : repo.count),
  });

/** The search, lowercased; none when the box is empty. */
const queryOf = (snapshot: Snapshot): Option.Option<string> =>
  Option.liftPredicate(snapshot.search.trim().toLowerCase(), (q) => q !== "");

/** Does the search let this worktree through: its branch or its repo's name holds the text. */
const matches = (query: Option.Option<string>, repo: Repo, worktree: Worktree): boolean =>
  Option.match(query, {
    onNone: () => true,
    onSome: (q) =>
      lastSegment(repo.root).toLowerCase().includes(q) ||
      Option.exists(worktree.branch, (branch) => branch.toLowerCase().includes(q)),
  });

const nameMatches = (query: Option.Option<string>, repo: Repo): boolean =>
  Option.match(query, {
    onNone: () => true,
    onSome: (q) => lastSegment(repo.root).toLowerCase().includes(q),
  });

const noMatch = (query: string): string => `Nothing matches "${query}".`;

/** The machine `repo` is on, named only while the list holds repos on more than one. */
const machineLabel = (snapshot: Snapshot, repo: Repo): Option.Option<string> =>
  Option.liftPredicate(
    machineName(repo.machine),
    () => new Set(snapshot.repos.map((listed) => listed.machine)).size > 1,
  );

/** A flat row's repo: its folder name, after its machine while more than one is listed. */
const flatRepoName = (snapshot: Snapshot, repo: Repo): string =>
  Option.match(machineLabel(snapshot, repo), {
    onNone: () => lastSegment(repo.root),
    onSome: () =>
      locatedLabel({ machine: repo.machine, folder: lastSegment(repo.root) }, { nameHere: true }),
  });

const repoView = (
  repo: Repo,
  snapshot: Snapshot,
  places: readonly Place[],
  { foldable }: { readonly foldable: boolean } = { foldable: true },
): RepoView => {
  const list = listOf(snapshot, repo);
  const all = Option.match(list, { onNone: () => [], onSome: (l) => l.worktrees });
  const query = queryOf(snapshot);
  const worktrees = all.filter((w) => matches(query, repo, w));
  // A search shows every match, so it opens whatever is folded.
  const searching = Option.isSome(query);
  const key = repoKey(repo);
  const folded = foldable && !searching && snapshot.folded[key] === true;
  // Every worktree, matching or not, so a space never moves to a shorter path.
  const on = spacesOnWorktrees(
    places,
    repo.machine,
    all.map((w) => w.path),
  );
  const toRow = (worktree: Worktree) =>
    rowView(snapshot, repo, worktree, Option.fromNullishOr(on.get(worktree.path)));
  const inSection = (kind: SectionKind) =>
    worktrees.filter((w) => Option.contains(kindOf(w), kind)).sort(newestFirst);
  return {
    key,
    name: lastSegment(repo.root),
    machine: machineLabel(snapshot, repo),
    group: repo.group === OTHER ? Option.none() : Option.some(repo.group),
    count: Option.map(list, () => countOf(repo, list)),
    status: statusOf(list),
    ciNote: Option.map(
      Option.flatMap(Option.fromNullishOr(snapshot.ci.get(key)), (ci) => ci.error),
      (error) => `CI status not updated: ${error}`,
    ),
    folded,
    foldable,
    main: folded ? [] : worktrees.filter((w) => Option.isNone(kindOf(w))).map(toRow),
    sections: folded
      ? []
      : SECTIONS.flatMap(([kind, label]) => {
          const rows = inSection(kind);
          const sectionKey = `${key}|${kind}`;
          const sectionFolded = !searching && snapshot.folded[sectionKey] === true;
          return rows.length === 0
            ? []
            : [
                {
                  key: sectionKey,
                  kind,
                  label,
                  count: rows.length,
                  folded: sectionFolded,
                  rows: sectionFolded ? [] : rows.map(toRow),
                },
              ];
        }),
  };
};

const emptyText = (snapshot: Snapshot): string => {
  if (!snapshot.discovered) return "Looking for repos…";
  if (snapshot.settings.folders.length === 0) {
    return `No repos yet. Add your repo folders in Settings, or in ${snapshot.settingsFile} in Herdr's folder.`;
  }
  return "No repos found in your group folders.";
};

/** Group names in the group filter's order: Settings order, then unknown names sorted, then Other. */
const orderGroups = (names: readonly string[], settings: Settings): readonly string[] => {
  const have = new Set(names);
  const order = settings.folders.map((folder) => folder.name);
  const unknown = Array.from(have)
    .filter((name) => !order.includes(name) && name !== OTHER)
    .sort();
  return Array.from(
    new Set([
      ...order.filter((name) => have.has(name)),
      ...unknown,
      ...(have.has(OTHER) ? [OTHER] : []),
    ]),
  );
};

/** What decides which repos the group filter lets through. */
type Scope = Pick<Snapshot, "repos" | "discovered" | "settings" | "view">;

/**
 * The selected group. A saved group no repo is in any more falls back to All, but only
 * once the repos are known, so a saved group never flashes back to All at start.
 */
const selectedGroup = ({ repos, discovered, view }: Scope): Option.Option<string> =>
  Option.filter(view.group, (group) => !discovered || repos.some((repo) => repo.group === group));

/** Every machine a repo or a group folder is on: this machine first, then by name. */
const machinesOf = ({ repos, settings }: Pick<Scope, "repos" | "settings">): readonly Machine[] =>
  Array.from(
    new Set([
      ...repos.map((repo) => repo.machine),
      ...settings.folders.map((folder) => folder.machine),
    ]),
  ).sort(byMachine);

/**
 * The filtered machine. One no repo or folder is on any more falls back to All, but only
 * once the repos are known, so a saved filter never flashes back to All at start.
 */
const selectedMachine = (scope: Scope): Option.Option<Machine> =>
  Option.filter(
    scope.view.machine,
    (machine) => !scope.discovered || machinesOf(scope).includes(machine),
  );

/** The repos the machine filter lets through, in order. */
const reposOnMachine = (scope: Scope): readonly Repo[] =>
  Option.match(selectedMachine(scope), {
    onNone: () => scope.repos,
    onSome: (machine) => scope.repos.filter((repo) => repo.machine === machine),
  });

/** The repos the machine filter and the group filter let through, in order. */
export const reposInGroup = (scope: Scope): readonly Repo[] => {
  const repos = reposOnMachine(scope);
  return Option.match(selectedGroup({ ...scope, repos }), {
    onNone: () => repos,
    onSome: (group) => repos.filter((repo) => repo.group === group),
  });
};

/**
 * The repos worth reading: the selected group's; in the Current view the Current repo
 * alone, or every repo on the filtered machines (for the Open list) when the focused
 * folder is in none. None on a machine that can't be read now.
 */
export const reposToRead = (
  scope: Scope & Pick<Snapshot, "current" | "machines">,
): readonly Repo[] => {
  const repos =
    scope.view.show !== "current"
      ? reposInGroup(scope)
      : scope.current._tag === "InRepo"
        ? [scope.current.repo]
        : reposOnMachine(scope);
  return repos.filter((repo) => !scope.machines.has(repo.machine));
};

const chipsOf = (snapshot: Snapshot): readonly Chip[] => {
  const selected = selectedGroup(snapshot);
  const groups = snapshot.discovered
    ? orderGroups(
        snapshot.repos.map((repo) => repo.group),
        snapshot.settings,
      )
    : Array.from(new Set(snapshot.settings.folders.map((folder) => folder.name)));
  return [
    { label: "All", group: Option.none(), selected: Option.isNone(selected) },
    ...groups.map((group) => ({
      label: group,
      group: Option.some(group),
      selected: Option.contains(selected, group),
    })),
  ];
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The views that list worktrees flat, across repos. */
type FlatShow = Exclude<Show, "repos" | "current">;

const FLAT_EMPTY: Readonly<Record<FlatShow, string>> = {
  merged: "Nothing to clean up.",
  active: "No worktrees in progress.",
  conflict: "No worktrees conflict with main.",
  open: "No worktree has a space open.",
};

const treeBody = (snapshot: Snapshot, places: readonly Place[]): Body => {
  const query = queryOf(snapshot);
  const repos = reposInGroup(snapshot)
    .filter((repo) => !snapshot.view.only || countOf(repo, listOf(snapshot, repo)) > 1)
    .filter(
      (repo) =>
        nameMatches(query, repo) ||
        Option.exists(listOf(snapshot, repo), (l) =>
          l.worktrees.some((w) => matches(query, repo, w)),
        ),
    );
  // Every group offered has repos, so only the search or the toggle can leave the tree empty.
  if (repos.length === 0) {
    return {
      _tag: "Message",
      text: Option.match(query, {
        onSome: noMatch,
        onNone: () => "No repos with worktrees here. Choose All repos to see the rest.",
      }),
    };
  }
  return { _tag: "Tree", repos: repos.map((repo) => repoView(repo, snapshot, places)) };
};

const flatBody = (
  snapshot: Snapshot,
  places: readonly Place[],
  show: FlatShow,
  repos: readonly Repo[] = reposInGroup(snapshot),
): Body => {
  const query = queryOf(snapshot);
  const found = repos.flatMap((repo) => {
    const worktrees = Option.match(listOf(snapshot, repo), {
      onNone: () => [],
      onSome: (list) => list.worktrees,
    });
    const on = spacesOnWorktrees(
      places,
      repo.machine,
      worktrees.map((w) => w.path),
    );
    return worktrees
      .filter((w) => (show === "open" ? on.has(w.path) : Option.contains(kindOf(w), show)))
      .filter((w) => matches(query, repo, w))
      .map((worktree) => ({ repo, worktree, space: Option.fromNullishOr(on.get(worktree.path)) }));
  });
  if (found.length === 0) {
    const unread = repos.some((repo) => !snapshot.lists.has(repoKey(repo)));
    const empty = Option.match(query, { onSome: noMatch, onNone: () => FLAT_EMPTY[show] });
    return { _tag: "Message", text: unread ? "Reading…" : empty };
  }
  const repoCount = new Set(found.map(({ repo }) => repoKey(repo))).size;
  return {
    _tag: "Flat",
    summary:
      show === "merged"
        ? Option.some(`${found.length} merged in ${plural(repoCount, "repo")}`)
        : Option.none(),
    rows: [...found]
      .sort((a, b) => newestFirst(a.worktree, b.worktree))
      .map(({ repo, worktree, space }) => {
        const row = rowView(snapshot, repo, worktree, space);
        return { ...row, subline: `${flatRepoName(snapshot, repo)} · ${row.subline}` };
      }),
  };
};

/**
 * The Current repo as one expanded repo of the tree, whatever the group filter. Outside
 * every repo: a line saying so, over the Open view's list across all repos.
 */
const currentBody = (snapshot: Snapshot, places: readonly Place[]): Body => {
  const { current } = snapshot;
  switch (current._tag) {
    case "NotInRepo":
      return {
        _tag: "NotInRepo",
        text: "Not in a repo",
        open: flatBody(snapshot, places, "open", snapshot.repos),
      };
    case "InRepo": {
      const query = queryOf(snapshot);
      const view = repoView(current.repo, snapshot, places, { foldable: false });
      const empty = view.main.length === 0 && view.sections.length === 0;
      // An unread repo has no rows to search yet, so it stays to show it is Reading.
      if (Option.isSome(query) && empty && view.status._tag !== "Reading") {
        return { _tag: "Message", text: noMatch(query.value) };
      }
      return { _tag: "Tree", repos: [view] };
    }
    case "Looking":
      return { _tag: "Message", text: "Finding the current repo…" };
    case "Failed":
      return { _tag: "Message", text: `Couldn't find the current repo: ${current.reason}` };
  }
};

const bodyOf = (snapshot: Snapshot, places: readonly Place[]): Body => {
  const { show } = snapshot.view;
  if (show === "current") return currentBody(snapshot, places);
  if (snapshot.repos.length === 0) return { _tag: "Message", text: emptyText(snapshot) };
  return show === "repos" ? treeBody(snapshot, places) : flatBody(snapshot, places, show);
};

/** Machines in the filter's order: this machine first, then the others by name. */
const byMachine = (a: Machine, b: Machine): number =>
  a === b ? 0 : a === null ? -1 : b === null ? 1 : a.localeCompare(b);

/**
 * The machine filter's choices: All, then every machine a repo or a group folder is on.
 * None while there is only one machine, as there is nothing to filter.
 */
const machineFilterOf = (snapshot: Snapshot): readonly MachineChoice[] => {
  const machines = machinesOf(snapshot);
  const selected = selectedMachine(snapshot);
  if (machines.length < 2) return [];
  return [
    { label: "All", machine: Option.none(), selected: Option.isNone(selected) },
    ...machines.map((machine) => ({
      label: machineName(machine),
      machine: Option.some(machine),
      selected: Option.contains(selected, machine),
    })),
  ];
};

/** The one line for a machine that can't be read now. */
const machineLine = (machine: Machine, status: MachineStatus): string =>
  status._tag === "Connecting"
    ? `${machineName(machine)}: connecting…`
    : `Can't reach ${machineName(machine)}: ${status.reason}`;

/** Everything the panel draws for `snapshot`. */
export const buildView = (whole: Snapshot): PanelView => {
  // Only the filtered machine's repos are in view, so machine labels follow the filter. A
  // machine that can't be read has its one line instead of repos, so none shows stale.
  const snapshot: Snapshot = {
    ...whole,
    repos: reposOnMachine(whole).filter((repo) => !whole.machines.has(repo.machine)),
  };
  const places = spacePlaces(snapshot.spaces, snapshot.panes);
  return {
    loading: snapshot.loading,
    spinnerTip: snapshot.loading ? Option.some("Refreshing worktrees") : Option.none(),
    machineFilter: machineFilterOf(whole),
    chips: chipsOf(snapshot),
    views: SHOWS.map(([show, label]) => ({ show, label, selected: show === snapshot.view.show })),
    toggle: snapshot.view.show === "repos" ? Option.some(snapshot.view.only) : Option.none(),
    banners: [
      ...Option.toArray(
        Option.map(
          snapshot.settingsError,
          (error) => `${error} — using defaults until it's fixed.`,
        ),
      ),
      ...Option.toArray(
        Option.map(snapshot.discoverError, (error) => `Couldn't look for repos: ${error}`),
      ),
      ...snapshot.missingFolders.map(
        (folder) => `Group folder ${folder} doesn't exist, so it lists no repos.`,
      ),
      ...Array.from(snapshot.machines, ([machine, status]) => machineLine(machine, status)),
    ],
    body: bodyOf(snapshot, places),
  };
};
