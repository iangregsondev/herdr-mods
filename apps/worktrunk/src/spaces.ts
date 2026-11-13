// Which open Herdr space sits on which worktree. Pure: no `herdr` or `gpui` imports, so
// spaces and panes come in as plain data shaped like `spaces()` and `panes()`.
import { Option } from "effect";
import { THIS_MACHINE, type Located, type Machine } from "./machines.ts";
import { isUnder } from "./repos.ts";
import type { Click } from "./view.ts";

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
  /** The machine the space lives on; null for this one. */
  readonly machine: Machine;
  /** Where the space is now, on its machine. */
  readonly place: string;
}

/**
 * Where each space is now, on its machine: its first pane's live folder, else the folder
 * it was made in. Spaces with no folder at all are left out.
 */
export const spacePlaces = (
  spaces: readonly SpaceLike[],
  panes: readonly PaneLike[],
): readonly Place[] =>
  spaces.flatMap((space) => {
    const tabs = new Set(space.tabs.map((tab) => tab.id));
    const live = panes.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd;
    const place = live || space.folder;
    return place
      ? [{ space: { id: space.id, active: space.active }, machine: space.machine, place }]
      : [];
  });

/** Where the space `id` is now; none for a space with no place here. */
export const placeOf = (places: readonly Place[], id: string): Option.Option<string> =>
  Option.fromNullishOr(places.find((p) => p.space.id === id)?.place);

/**
 * The space on each of the worktree paths on `machine`. Only spaces on that machine
 * count: a folder of the same path elsewhere is another folder. A space sits on the
 * longest worktree path that contains its place, so a worktree nested in another's
 * folder still gets its own. When several sit on one worktree, the shown one wins, else
 * the first.
 */
export const spacesOnWorktrees = (
  places: readonly Place[],
  machine: Machine,
  paths: readonly string[],
): ReadonlyMap<string, SpaceRef> =>
  places
    .filter((place) => place.machine === machine)
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
  const places = new Map(spacePlaces(spaces, panes).map(({ space, place }) => [space.id, place]));
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
 * The folder the person is working in, on the focused space's machine: the focused
 * terminal's, else (a mod pane or the panel itself has focus) where the focused space
 * is, so focusing the panel keeps it. A terminal on this machine that has run `ssh`
 * still counts as this machine: Herdr knows only the space's machine.
 */
export const focusedFolder = (
  focus: FocusLike | null,
  places: readonly Place[],
): Option.Option<Located> => {
  const at = Option.fromNullishOr(places.find((p) => p.space.id === focus?.space));
  const machine = Option.match(at, { onNone: () => THIS_MACHINE, onSome: (p) => p.machine });
  return Option.orElse(
    Option.map(Option.fromNullishOr(focus?.cwd || null), (folder): Located => ({
      machine,
      folder,
    })),
    () => Option.map(at, (p): Located => ({ machine: p.machine, folder: p.place })),
  );
};

/** A Herdr command (`run`) and its arguments. */
export interface Command {
  readonly command: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * The Herdr command a click on a worktree row runs: select its space, or open a new one
 * on the worktree's machine (Herdr's `space.new` takes no machine for this one).
 */
export const clickCommand = (click: Click): Command =>
  click._tag === "Select"
    ? { command: "space.select", args: { id: click.space } }
    : {
        command: "space.new",
        args: {
          name: click.name,
          folder: click.folder,
          ...(click.machine === null ? {} : { machine: click.machine }),
        },
      };

/** A worktree a space is wanted on: its machine, its folder there, and the name for a new space. */
export interface Wanted {
  readonly machine: Machine;
  readonly folder: string;
  readonly name: string;
}

/** The space to go to for `wanted`: the one on it, else a new one there. */
export const goTo = (places: readonly Place[], wanted: Wanted): Click =>
  Option.match(
    Option.fromNullishOr(
      spacesOnWorktrees(places, wanted.machine, [wanted.folder]).get(wanted.folder),
    ),
    {
      onSome: (on): Click => ({ _tag: "Select", space: on.id }),
      onNone: (): Click => ({ _tag: "New", ...wanted }),
    },
  );
