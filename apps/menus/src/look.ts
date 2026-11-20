// How the sidebar copy draws each space: its name's colour and the pills after it.
// Pure: no `herdr` or `gpui` imports. Colours are theme keys; the copy reads them from
// Herdr's theme when it draws.
import { Option } from "effect";

/** A key of Herdr's theme (`theme()`), as the sidebar copy reads a colour from it. */
export type ThemeKey = "foreground" | "dim";

/** What the worktrunk panel publishes about one space. */
export interface SpaceMarks {
  /** The space's group label, none when it is in no group. */
  readonly group: Option.Option<string>;
}

/** A small label drawn after a space's name. */
export interface Pill {
  readonly label: string;
  /** Its text colour; every pill has the same raised background. */
  readonly color: ThemeKey;
}

/** The pills after a space's name, in order. */
export const spacePills = (marks: SpaceMarks): readonly Pill[] =>
  Option.match(marks.group, {
    onNone: () => [],
    onSome: (group) => [{ label: group, color: "dim" }],
  });

/** The theme colour a space's name is drawn in. */
export const nameColor = (_marks: SpaceMarks): ThemeKey => "foreground";
