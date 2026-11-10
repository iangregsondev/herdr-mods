// Which open Herdr space sits on which worktree. Pure: no `herdr` or `gpui` imports, so
// spaces and panes come in as plain data shaped like `spaces()` and `panes()`.
import { Option } from "effect";
import { isUnder } from "./repos.ts";

/** The parts of a `SpaceInfo` this module reads. */
export interface SpaceLike {
  readonly id: string;
  readonly folder: string;
  readonly machine: string | null;
  readonly active: boolean;
  readonly tabs: readonly { readonly id: string }[];
}

/** The parts of a `PaneInfo` this module reads. */
export interface PaneLike {
  readonly tab: string;
  readonly cwd: string | null;
}

export interface SpaceRef {
  readonly id: string;
  /** The space Herdr shows. */
  readonly active: boolean;
}

export interface Place {
  readonly space: SpaceRef;
  /** Where the space is now. */
  readonly place: string;
}

/**
 * Where each space on this machine is now: its first pane's live folder, else the folder
 * it was made in. Spaces on other machines, and spaces with no folder at all, are left out.
 */
export const localPlaces = (
  spaces: readonly SpaceLike[],
  panes: readonly PaneLike[],
): readonly Place[] =>
  spaces.flatMap((space) => {
    if (space.machine !== null) return [];
    const tabs = new Set(space.tabs.map((tab) => tab.id));
    const live = panes.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd;
    const place = live || space.folder;
    return place ? [{ space: { id: space.id, active: space.active }, place }] : [];
  });

/**
 * The space on each worktree path. A space sits on the longest worktree path that
 * contains its place, so a worktree nested in another's folder still gets its own.
 * When several sit on one worktree, the shown one wins, else the first.
 */
export const spacesOnWorktrees = (
  places: readonly Place[],
  paths: readonly string[],
): ReadonlyMap<string, SpaceRef> =>
  places
    .flatMap(({ space, place }) => {
      const longest = paths
        .filter((path) => isUnder(place, path))
        .reduce<Option.Option<string>>(
          (best, path) =>
            Option.isSome(best) && best.value.length >= path.length ? best : Option.some(path),
          Option.none(),
        );
      return Option.match(longest, {
        onNone: () => [],
        onSome: (path) => [{ path, space }],
      });
    })
    .reduce<ReadonlyMap<string, SpaceRef>>((on, { path, space }) => {
      const held = on.get(path);
      if (held && (held.active || !space.active)) return on;
      return new Map([...on, [path, space]]);
    }, new Map());

/**
 * The ids of the spaces on this machine whose folder (where the space was made) or
 * place (where its first terminal is now) is one of the `gone` folders, or inside one.
 * Both count because wt moves a removed worktree into a trash folder and a shell inside
 * it moves too, so the place alone can point somewhere that still exists.
 */
export const spacesInGone = (
  spaces: readonly SpaceLike[],
  panes: readonly PaneLike[],
  gone: readonly string[],
): readonly string[] => {
  const inGone = (path: string) => gone.some((folder) => isUnder(path, folder));
  const places = new Map(localPlaces(spaces, panes).map(({ space, place }) => [space.id, place]));
  return spaces
    .filter((space) => space.machine === null)
    .filter((space) => inGone(space.folder) || inGone(places.get(space.id) ?? ""))
    .map((space) => space.id);
};

/** The parts of `focused()` this module reads. */
export interface FocusLike {
  readonly space: string;
  /** The focused terminal's live folder; null when no terminal has focus. */
  readonly cwd: string | null;
}

/**
 * The folder the person is working in: the focused terminal's, else (a mod pane or the
 * panel itself has focus) where the focused space is, so focusing the panel keeps it.
 */
export const focusedFolder = (
  focus: FocusLike | null,
  places: readonly Place[],
): Option.Option<string> =>
  Option.orElse(Option.fromNullishOr(focus?.cwd || null), () =>
    Option.fromNullishOr(places.find((p) => p.space.id === focus?.space)?.place),
  );
