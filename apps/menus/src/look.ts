// How the sidebar copy draws each space: its name's colour and the pills after it.
// Pure: no `herdr` or `gpui` imports. Colours are theme keys; the copy reads them from
// Herdr's theme when it draws.
import { Option } from "effect";
import { at, spaceGroup, spaceOrphan, text, type PublishedOrphan } from "worktrunk-mailbox";

/** A key of Herdr's theme (`theme()`), as the sidebar copy reads a colour from it. */
export type ThemeKey = "foreground" | "dim" | "ansi3";

/** What the worktrunk panel publishes about one space. */
export interface SpaceMarks {
  /** The space's group label, none when it is in no group. */
  readonly group: Option.Option<string>;
  /** What the panel published about the space as an orphan space, none when it isn't one. */
  readonly orphan: Option.Option<PublishedOrphan>;
}

/**
 * What the panel published in `orphans` about the space `id` as an orphan space: none
 * unless the space is one of the `open` ones, since a closed space's entry waits for the
 * panel's next refresh to go.
 */
export const openOrphan = (
  orphans: unknown,
  open: readonly string[],
  id: string,
): Option.Option<PublishedOrphan> => (open.includes(id) ? spaceOrphan(orphans, id) : Option.none());

/** What the panel published about the space `id`, from its published groups and orphans. */
export const spaceMarks = (
  id: string,
  groups: unknown,
  orphans: unknown,
  open: readonly string[],
): SpaceMarks => ({
  group: spaceGroup(groups, id),
  orphan: openOrphan(orphans, open, id),
});

/**
 * The marks of `space` (one of Herdr's space objects), read by its id from the published
 * groups and orphans; none for a space with no id.
 */
export const marksFor = (
  space: unknown,
  groups: unknown,
  orphans: unknown,
  open: readonly string[],
): SpaceMarks =>
  Option.match(text(at(space, "id")), {
    onNone: (): SpaceMarks => ({ group: Option.none(), orphan: Option.none() }),
    onSome: (id) => spaceMarks(id, groups, orphans, open),
  });

/** A small label drawn after a space's name. */
export interface Pill {
  readonly label: string;
  /** Its text colour; every pill has the same raised background. */
  readonly color: ThemeKey;
  /** What hovering it tells, none for a pill with nothing more to say than its label. */
  readonly tooltip: Option.Option<string>;
}

/** The name of the repo whose main checkout is the folder `repo`: its last part. */
const repoName = (repo: string): string => repo.split("/").at(-1) ?? repo;

/**
 * The pill on an orphan space: its text in the theme's yellow, a warning, and a tooltip
 * naming where the space came from, its repo and its removed folder.
 */
const orphanPill = ({ folder, repo }: PublishedOrphan): Pill => ({
  label: "Orphan",
  color: "ansi3",
  tooltip: Option.some(`Worktree removed from ${repoName(repo)} · ${folder}`),
});

/** The pills after a space's name, in order: its group pill, then the Orphan pill. */
export const spacePills = (marks: SpaceMarks): readonly Pill[] => [
  ...Option.match(marks.group, {
    onNone: (): readonly Pill[] => [],
    onSome: (group): readonly Pill[] => [{ label: group, color: "dim", tooltip: Option.none() }],
  }),
  ...Option.match(marks.orphan, {
    onNone: (): readonly Pill[] => [],
    onSome: (orphan): readonly Pill[] => [orphanPill(orphan)],
  }),
];

/** A pill as the sidebar copy reads it: plain JS, its tooltip text or null for none. */
export interface PlainPill {
  readonly label: string;
  readonly color: ThemeKey;
  readonly tooltip: string | null;
}

/** `pills` in the shape the sidebar copy reads. */
export const plainPills = (pills: readonly Pill[]): readonly PlainPill[] =>
  pills.map((pill) => ({ ...pill, tooltip: Option.getOrNull(pill.tooltip) }));

/**
 * The theme colour a space's name is drawn in: dim for an orphan space, so it reads as
 * inactive (its text only, never the row's opacity, which would fade its pills too).
 */
export const nameColor = (marks: SpaceMarks): ThemeKey =>
  Option.isSome(marks.orphan) ? "dim" : "foreground";

/** A space's git entry, in the shape Herdr's sidebar keeps for each place it asked git about. */
export interface GitEntry {
  readonly name: string;
  readonly branch: string;
  readonly ahead: number;
  readonly behind: number;
  readonly repo: string;
  readonly linked: boolean;
}

/**
 * The git entry the sidebar copy falls back to for a space git can't answer for: for an
 * open space the panel published as an orphan, a linked worktree of its repo, so Herdr's
 * own ordering nests it under that repo's main checkout space (or keeps it at the top
 * level when none is open). Its repo is keyed as Herdr keys a repo from git's common
 * folder on the space's machine (none for this machine), its branch is the space's own
 * name so Herdr's git tail shows no branch, and it is never ahead or behind. None for any
 * other space.
 */
export const orphanGit = (
  space: unknown,
  orphans: unknown,
  open: readonly string[],
): Option.Option<GitEntry> =>
  Option.flatMap(text(at(space, "id")), (id) =>
    Option.map(openOrphan(orphans, open, id), ({ repo }) => ({
      name: repoName(repo),
      branch: Option.getOrElse(text(at(space, "name")), () => ""),
      ahead: 0,
      behind: 0,
      repo: JSON.stringify([Option.getOrNull(text(at(space, "machine"))), `${repo}/.git`]),
      linked: true,
    })),
  );
