// How the sidebar copy draws each space: its name's colour and the pills after it.
// Pure: no `herdr` or `gpui` imports. Colours are theme keys; the copy reads them from
// Herdr's theme when it draws.
import { Option } from "effect";
import { at, spaceGroup, spaceOrphan, text } from "worktrunk-mailbox";

/** A key of Herdr's theme (`theme()`), as the sidebar copy reads a colour from it. */
export type ThemeKey = "foreground" | "dim" | "ansi3";

/** What the worktrunk panel publishes about one space. */
export interface SpaceMarks {
  /** The space's group label, none when it is in no group. */
  readonly group: Option.Option<string>;
  /** Whether the panel published the space as an orphan space. */
  readonly orphan: boolean;
}

/**
 * What the panel published about the space `id`, from its published groups and orphans:
 * an orphan only while the space is one of the `open` ones, since a closed space's entry
 * waits for the panel's next refresh to go.
 */
export const spaceMarks = (
  id: string,
  groups: unknown,
  orphans: unknown,
  open: readonly string[],
): SpaceMarks => ({
  group: spaceGroup(groups, id),
  orphan: open.includes(id) && Option.isSome(spaceOrphan(orphans, id)),
});

/** A small label drawn after a space's name. */
export interface Pill {
  readonly label: string;
  /** Its text colour; every pill has the same raised background. */
  readonly color: ThemeKey;
}

/** The pill on an orphan space: its text in the theme's yellow, a warning. */
const ORPHAN_PILL: Pill = { label: "Orphan", color: "ansi3" };

/** The pills after a space's name, in order: its group pill, then the Orphan pill. */
export const spacePills = (marks: SpaceMarks): readonly Pill[] => [
  ...Option.match(marks.group, {
    onNone: (): readonly Pill[] => [],
    onSome: (group): readonly Pill[] => [{ label: group, color: "dim" }],
  }),
  ...(marks.orphan ? [ORPHAN_PILL] : []),
];

/**
 * The theme colour a space's name is drawn in: dim for an orphan space, so it reads as
 * inactive (its text only, never the row's opacity, which would fade its pills too).
 */
export const nameColor = (marks: SpaceMarks): ThemeKey => (marks.orphan ? "dim" : "foreground");

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
  Option.flatMap(
    Option.filter(text(at(space, "id")), (id) => open.includes(id)),
    (id) =>
      Option.map(spaceOrphan(orphans, id), ({ repo }) => ({
        name: repo.split("/").at(-1) ?? repo,
        branch: Option.getOrElse(text(at(space, "name")), () => ""),
        ahead: 0,
        behind: 0,
        repo: JSON.stringify([Option.getOrNull(text(at(space, "machine"))), `${repo}/.git`]),
        linked: true,
      })),
  );
