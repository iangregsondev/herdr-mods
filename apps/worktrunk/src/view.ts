// What the panel draws, from one snapshot of everything it knows. Pure: no `herdr` or
// `gpui` imports, so the shell (main.ts) only turns this into elements.
import { Option } from "effect";
import type { CiRead, CurrentRepo, RepoList } from "./reads.ts";
import { OTHER, type Repo } from "./repos.ts";
import { lastSegment, type Settings } from "./settings.ts";
import {
  localPlaces,
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
  ["repos", "Repos"],
  ["merged", "Clean up"],
  ["active", "Active"],
  ["conflict", "Conflicts"],
  ["open", "Open"],
  ["current", "Current"],
];

/** How the list is sliced; remembered across restarts. */
export interface ViewState {
  /** The selected group chip; none for All. */
  readonly group: Option.Option<string>;
  readonly show: Show;
  /** "With worktrees": the Repos view hides repos with only a main checkout. */
  readonly only: boolean;
}

export const DEFAULT_VIEW_STATE: ViewState = { group: Option.none(), show: "repos", only: true };

export interface Snapshot {
  /** The repos to list, in order. */
  readonly repos: readonly Repo[];
  /** The first folder scan has finished. */
  readonly discovered: boolean;
  readonly loading: boolean;
  /** Each repo's list by its root; a repo missing here hasn't been read yet. */
  readonly lists: ReadonlyMap<string, RepoList>;
  readonly settings: Settings;
  readonly settingsError: Option.Option<string>;
  /** Why the last search for repos (folder scan, open spaces' repos) failed, if it did. */
  readonly discoverError: Option.Option<string>;
  /** The settings file's name, for the empty-state hint. */
  readonly settingsFile: string;
  readonly spaces: readonly SpaceLike[];
  readonly panes: readonly PaneLike[];
  /** Folded repos (by root) and groups (by `<root>|<kind>`). */
  readonly folded: Readonly<Record<string, boolean>>;
  /** Each repo's CI by its root; CI is read less often than the list. */
  readonly ci: ReadonlyMap<string, CiRead>;
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
  | { readonly _tag: "New"; readonly name: string; readonly folder: string };

/** A row's CI badge; `stale` when the checks ran on an older commit than the one pushed. */
export interface CiBadge {
  readonly status: CiStatus | "conflicts" | "unknown";
  readonly stale: boolean;
}

export interface RowView {
  /** The worktree's path: unique, so also the element id. */
  readonly key: string;
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
  /** None when CI wasn't asked for, or there is no PR and no checks. */
  readonly ci: Option.Option<CiBadge>;
  readonly click: Click;
}

export type SectionKind = "merged" | "active" | "conflict";

export interface SectionView {
  /** `<root>|<kind>`: unique, and its fold key. */
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
  /** The repo's root: unique, and its fold key. */
  readonly key: string;
  readonly name: string;
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

export interface Chip {
  readonly label: string;
  /** The group it selects; none for All. */
  readonly group: Option.Option<string>;
  readonly selected: boolean;
}

export interface PanelView {
  /** Show the spinner. */
  readonly loading: boolean;
  /** All, then one per group. */
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
    Option.fromNullishOr(snapshot.ci.get(repo.root)?.byPath.get(worktree.path)),
    () => worktree.ci,
  );

const rowView = (
  snapshot: Snapshot,
  repo: Repo,
  worktree: Worktree,
  space: Option.Option<SpaceRef>,
): RowView => ({
  key: worktree.path,
  repo: repo.root,
  label: Option.getOrElse(worktree.branch, () => "(detached)"),
  tone: Option.getOrElse(kindOf(worktree), (): Tone => "main"),
  hollow: Option.isNone(space),
  dirty: worktree.dirty,
  open: Option.isSome(space),
  current: Option.exists(space, (s) => s.active),
  subline: subline(worktree, snapshot.now),
  ci: badgeOf(ciOf(snapshot, repo, worktree)),
  click: Option.match(space, {
    onNone: (): Click => ({
      _tag: "New",
      name:
        worktree.state._tag === "Main"
          ? lastSegment(repo.root)
          : Option.getOrElse(worktree.branch, () => lastSegment(worktree.path)),
      folder: worktree.path,
    }),
    onSome: (s): Click => ({ _tag: "Select", space: s.id }),
  }),
});

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
  Option.fromNullishOr(snapshot.lists.get(repo.root));

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
  const folded = foldable && !searching && snapshot.folded[repo.root] === true;
  // Every worktree, matching or not, so a space never moves to a shorter path.
  const on = spacesOnWorktrees(
    places,
    all.map((w) => w.path),
  );
  const toRow = (worktree: Worktree) =>
    rowView(snapshot, repo, worktree, Option.fromNullishOr(on.get(worktree.path)));
  const inSection = (kind: SectionKind) =>
    worktrees.filter((w) => Option.contains(kindOf(w), kind)).sort(newestFirst);
  return {
    key: repo.root,
    name: lastSegment(repo.root),
    group: repo.group === OTHER ? Option.none() : Option.some(repo.group),
    count: Option.map(list, () => countOf(repo, list)),
    status: statusOf(list),
    ciNote: Option.map(
      Option.flatMap(Option.fromNullishOr(snapshot.ci.get(repo.root)), (ci) => ci.error),
      (error) => `CI status not updated: ${error}`,
    ),
    folded,
    foldable,
    main: folded ? [] : worktrees.filter((w) => Option.isNone(kindOf(w))).map(toRow),
    sections: folded
      ? []
      : SECTIONS.flatMap(([kind, label]) => {
          const rows = inSection(kind);
          const key = `${repo.root}|${kind}`;
          const sectionFolded = !searching && snapshot.folded[key] === true;
          return rows.length === 0
            ? []
            : [
                {
                  key,
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
    return `No repos yet. Add your repo folders to ${snapshot.settingsFile} in Herdr's folder.`;
  }
  return "No repos found in your group folders.";
};

/** Group names in chip order: Settings order, then unknown names sorted, then Other. */
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

/** What decides which repos a group chip lets through. */
type Scope = Pick<Snapshot, "repos" | "discovered" | "settings" | "view">;

/**
 * The selected group. A saved group no repo is in any more falls back to All, but only
 * once the repos are known, so a saved chip never flashes back to All at start.
 */
const selectedGroup = ({ repos, discovered, view }: Scope): Option.Option<string> =>
  Option.filter(view.group, (group) => !discovered || repos.some((repo) => repo.group === group));

/** The repos the selected group chip lets through, in order: the ones worth reading. */
export const reposInGroup = (scope: Scope): readonly Repo[] =>
  Option.match(selectedGroup(scope), {
    onNone: () => scope.repos,
    onSome: (group) => scope.repos.filter((repo) => repo.group === group),
  });

/**
 * The repos worth reading: the selected chip's; in the Current view the Current repo
 * alone, or every repo (for the Open list) when the focused folder is in none.
 */
export const reposToRead = (scope: Scope & Pick<Snapshot, "current">): readonly Repo[] => {
  if (scope.view.show !== "current") return reposInGroup(scope);
  return scope.current._tag === "InRepo" ? [scope.current.repo] : scope.repos;
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
  // Every chip has repos, so only the search or the toggle can leave the tree empty.
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
      worktrees.map((w) => w.path),
    );
    return worktrees
      .filter((w) => (show === "open" ? on.has(w.path) : Option.contains(kindOf(w), show)))
      .filter((w) => matches(query, repo, w))
      .map((worktree) => ({ repo, worktree, space: Option.fromNullishOr(on.get(worktree.path)) }));
  });
  if (found.length === 0) {
    const unread = repos.some((repo) => !snapshot.lists.has(repo.root));
    const empty = Option.match(query, { onSome: noMatch, onNone: () => FLAT_EMPTY[show] });
    return { _tag: "Message", text: unread ? "Reading…" : empty };
  }
  const repoCount = new Set(found.map(({ repo }) => repo.root)).size;
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
        return { ...row, subline: `${lastSegment(repo.root)} · ${row.subline}` };
      }),
  };
};

/**
 * The Current repo as one expanded repo of the tree, whatever the group chip. Outside
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

/** Everything the panel draws for `snapshot`. */
export const buildView = (snapshot: Snapshot): PanelView => {
  const places = localPlaces(snapshot.spaces, snapshot.panes);
  return {
    loading: snapshot.loading,
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
    ],
    body: bodyOf(snapshot, places),
  };
};
