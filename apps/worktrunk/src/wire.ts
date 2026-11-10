// What the panel keeps in Herdr's shared state, read back into typed values. Shared state
// may hold anything (another mod's write, an older build's), so every reader checks the
// shape and leaves out what it can't read. Pure: no `herdr` or `gpui` imports.
import { Option, Predicate } from "effect";
import { fields, text } from "./json.ts";
import { DEFAULT_VIEW_STATE, SHOWS, type Show, type ViewState } from "./view.ts";

/** The view state as kept in shared state: plain JSON. */
export interface StoredViewState {
  readonly group: string | null;
  readonly show: Show;
  readonly only: boolean;
}

export const writeViewState = (state: ViewState): StoredViewState => ({
  group: Option.getOrNull(state.group),
  show: state.show,
  only: state.only,
});

const readShow = (value: unknown): Option.Option<Show> =>
  Option.fromNullishOr(SHOWS.find(([show]) => show === value)?.[0]);

/** The view state kept in shared state; anything missing or unreadable is the default. */
export const readViewState = (value: unknown): ViewState => {
  const { group, show, only } = fields(value);
  return {
    group: text(group),
    show: Option.getOrElse(readShow(show), () => DEFAULT_VIEW_STATE.show),
    only: Predicate.isBoolean(only) ? only : DEFAULT_VIEW_STATE.only,
  };
};

/** The folded repos and groups record; entries that aren't true or false are left out. */
export const readFolded = (value: unknown): Readonly<Record<string, boolean>> =>
  Object.fromEntries(
    Object.entries(fields(value)).flatMap(([key, folded]) =>
      Predicate.isBoolean(folded) ? [[key, folded] as const] : [],
    ),
  );
