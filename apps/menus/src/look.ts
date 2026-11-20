// How the sidebar copy draws each space: its name's colour and the pills after it.
// Pure: no `herdr` or `gpui` imports. Colours are theme keys; the copy reads them from
// Herdr's theme when it draws.
import { Option } from "effect";
import { spaceGroup, spaceOrphan } from "worktrunk-mailbox";

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

/** The theme colour a space's name is drawn in. */
export const nameColor = (_marks: SpaceMarks): ThemeKey => "foreground";
