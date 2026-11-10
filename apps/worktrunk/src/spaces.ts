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
