// What the panel draws, from one snapshot of everything it knows. Pure: no `herdr` or
// `gpui` imports, so the shell (main.ts) only turns this into elements.
import { Option } from "effect";
import type { RepoList } from "./reads.ts";
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
import type { Worktree } from "./worktrees.ts";

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
  /** ms since the epoch, for commit ages. */
  readonly now: number;
}

/** The dot's colour: the theme's accent, done, working and blocked colours. */
export type Tone = "main" | "merged" | "active" | "conflict";

export type Click =
  | { readonly _tag: "Select"; readonly space: string }
  | { readonly _tag: "New"; readonly name: string; readonly folder: string };

export interface RowView {
  /** The worktree's path: unique, so also the element id. */
  readonly key: string;
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
  readonly folded: boolean;
  /** Empty while folded. */
  readonly main: readonly RowView[];
  readonly sections: readonly SectionView[];
}

export type Body =
  | { readonly _tag: "Message"; readonly text: string }
  | { readonly _tag: "Tree"; readonly repos: readonly RepoView[] };

export interface PanelView {
  /** Show the spinner. */
  readonly loading: boolean;
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

const rowView = (
  repo: Repo,
  worktree: Worktree,
  space: Option.Option<SpaceRef>,
  now: number,
): RowView => ({
  key: worktree.path,
  label: Option.getOrElse(worktree.branch, () => "(detached)"),
  tone: Option.getOrElse(kindOf(worktree), (): Tone => "main"),
  hollow: Option.isNone(space),
  dirty: worktree.dirty,
  open: Option.isSome(space),
  current: Option.exists(space, (s) => s.active),
  subline: subline(worktree, now),
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

const repoView = (repo: Repo, snapshot: Snapshot, places: readonly Place[]): RepoView => {
  const list = Option.fromNullishOr(snapshot.lists.get(repo.root));
  const worktrees = Option.match(list, { onNone: () => [], onSome: (l) => l.worktrees });
  const folded = snapshot.folded[repo.root] === true;
  const on = spacesOnWorktrees(
    places,
    worktrees.map((w) => w.path),
  );
  const toRow = (worktree: Worktree) =>
    rowView(repo, worktree, Option.fromNullishOr(on.get(worktree.path)), snapshot.now);
  const inSection = (kind: SectionKind) =>
    worktrees.filter((w) => Option.contains(kindOf(w), kind)).sort(newestFirst);
  return {
    key: repo.root,
    name: lastSegment(repo.root),
    group: repo.group === OTHER ? Option.none() : Option.some(repo.group),
    count: Option.map(list, (l) => (l.worktrees.length > 0 ? l.worktrees.length : repo.count)),
    status: statusOf(list),
    folded,
    main: folded ? [] : worktrees.filter((w) => Option.isNone(kindOf(w))).map(toRow),
    sections: folded
      ? []
      : SECTIONS.flatMap(([kind, label]) => {
          const rows = inSection(kind);
          const key = `${repo.root}|${kind}`;
          const sectionFolded = snapshot.folded[key] === true;
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

/** Everything the panel draws for `snapshot`. */
export const buildView = (snapshot: Snapshot): PanelView => {
  const places = localPlaces(snapshot.spaces, snapshot.panes);
  return {
    loading: snapshot.loading,
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
    body:
      snapshot.repos.length === 0
        ? { _tag: "Message", text: emptyText(snapshot) }
        : { _tag: "Tree", repos: snapshot.repos.map((repo) => repoView(repo, snapshot, places)) },
  };
};
