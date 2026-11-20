// Orphan spaces: spaces left on worktrees removed outside the panel. Which worktree paths
// a fresh list read dropped, which wait for a folder check on their machine, whether a
// space on a gone folder closes at once or is kept, and which spaces the sidebar marks as
// orphans. Pure: no `herdr` or `gpui` imports.
import { Option, Predicate, Result } from "effect";
import { spaceOrphan, type PublishedOrphans } from "worktrunk-mailbox";
import { repoOfKey, type Machine, type RepoKey } from "./machines.ts";
import type { MachineLists, RepoList } from "./reads.ts";
import { goneSpaces, type PaneLike, type Place, type SpaceLike } from "./spaces.ts";

/** What the panel remembers about worktree paths dropped from their repo's list. */
export interface Orphans {
  /** The dropped paths on each machine, waiting for a folder check there to answer. */
  readonly waiting: ReadonlyMap<Machine, readonly string[]>;
  /** The folders the panel's own jobs removed on each machine, left out of dropped paths. */
  readonly removed: ReadonlyMap<Machine, readonly string[]>;
}

export const NO_ORPHANS: Orphans = { waiting: new Map(), removed: new Map() };

/** The dropped paths on `machine` waiting for a folder check: what the next check asks about. */
export const waitingOn = (orphans: Orphans, machine: Machine): readonly string[] =>
  orphans.waiting.get(machine) ?? [];

/**
 * The panel's own job removed the folders `gone` on `machine`: never dropped paths. Those
 * a list read already dropped stop waiting (a check running on them returns none of
 * them); the rest are left out of the next read that drops them.
 */
export const jobRemoved = (
  orphans: Orphans,
  machine: Machine,
  gone: readonly string[],
): Orphans => {
  const waits = waitingOn(orphans, machine);
  return {
    ...orphans,
    waiting: new Map([...orphans.waiting, [machine, waits.filter((path) => !gone.includes(path))]]),
    removed: new Map([
      ...orphans.removed,
      [
        machine,
        [...(orphans.removed.get(machine) ?? []), ...gone.filter((path) => !waits.includes(path))],
      ],
    ]),
  };
};

/** A repo's fresh read against its list from before. */
interface Fresh {
  /** The paths listed before and not now. */
  readonly dropped: readonly string[];
  /** Every path listed before or now. */
  readonly seen: readonly string[];
}

/**
 * What the panel remembers after `machine`'s batched list read answers, given each repo's
 * list from before (`old`). A folder a job removed is left out of the dropped paths, and
 * forgotten by the first fresh read of its repo, whether that read dropped it or lists it
 * again (a worktree made there anew), so its later removal in a terminal counts.
 */
export const listsRead = (
  orphans: Orphans,
  old: ReadonlyMap<RepoKey, RepoList>,
  machine: Machine,
  answer: MachineLists,
): Orphans => {
  const reads = Result.match(answer, {
    onFailure: (): readonly Fresh[] => [],
    onSuccess: (lists) =>
      Array.from(lists).flatMap(([key, list]) =>
        Result.match(list, {
          onFailure: (): readonly Fresh[] => [],
          onSuccess: (worktrees) => {
            const now = worktrees.map((w) => w.path);
            const before = (old.get(key)?.worktrees ?? []).map((w) => w.path);
            return [
              { dropped: before.filter((path) => !now.includes(path)), seen: [...before, ...now] },
            ];
          },
        }),
      ),
  });
  const dropped = reads.flatMap((fresh) => fresh.dropped);
  const seen = reads.flatMap((fresh) => fresh.seen);
  const removed = orphans.removed.get(machine) ?? [];
  return {
    ...orphans,
    waiting: new Map([
      ...orphans.waiting,
      [
        machine,
        [...waitingOn(orphans, machine), ...dropped.filter((path) => !removed.includes(path))],
      ],
    ]),
    removed: new Map([
      ...orphans.removed,
      [machine, removed.filter((path) => !seen.includes(path))],
    ]),
  };
};

/**
 * The folder check of the paths `asked` on `machine` answered: the folders it found gone,
 * or why it failed. Gone paths come back for their spaces to close or be kept; a
 * path whose folder exists is forgotten; a failed check leaves every path waiting for the
 * machine's next refresh. Paths dropped while the check ran wait on.
 */
export const checked = (
  orphans: Orphans,
  machine: Machine,
  asked: readonly string[],
  answer: Result.Result<readonly string[], string>,
): { readonly orphans: Orphans; readonly gone: readonly string[] } =>
  Result.match(answer, {
    onFailure: () => ({ orphans, gone: [] }),
    onSuccess: (gone) => ({
      orphans: {
        ...orphans,
        waiting: new Map([
          ...orphans.waiting,
          [machine, waitingOn(orphans, machine).filter((path) => !asked.includes(path))],
        ]),
      },
      gone: gone.filter(
        (path) => asked.includes(path) && waitingOn(orphans, machine).includes(path),
      ),
    }),
  });

/** The parts of a `PaneInfo` close-or-keep reads. */
export interface ProgramPane extends PaneLike {
  /** Null for a mod pane, which has no program. */
  readonly terminal: string | null;
  /** What the terminal runs; Herdr leaves it out of a mod pane. */
  readonly program?: { readonly shell: boolean };
}

/**
 * What happens to a space on a folder gone from a dropped path: `Close` at once when every
 * terminal in it runs a plain shell (mod panes don't count), else `Keep`, since closing
 * would end whatever else runs there. A kept space is left to the sidebar's Orphan pill
 * and its menu's close item, which asks first.
 */
export type CloseOrKeep = "Close" | "Keep";

export const closeOrKeep = (space: SpaceLike, panes: readonly ProgramPane[]): CloseOrKeep => {
  const tabs = new Set(space.tabs.map((tab) => tab.id));
  return panes
    .filter((pane) => tabs.has(pane.tab) && pane.terminal !== null)
    .every((pane) => pane.program?.shell === true)
    ? "Close"
    : "Keep";
};

/** A space on a gone folder, and what happens to it. */
export interface Orphan {
  readonly space: string;
  readonly step: CloseOrKeep;
  /** The gone folder the space was matched by. */
  readonly folder: string;
}

/**
 * The orphan spaces on `machine`: every space there on one of the `gone` folders (by
 * folder or place, as `goneSpaces` matches them), each closed or kept, with the gone
 * folder it was matched by.
 */
export const orphanSpaces = (
  spaces: readonly SpaceLike[],
  panes: readonly ProgramPane[],
  machine: Machine,
  gone: readonly string[],
): readonly Orphan[] => {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  return goneSpaces(spaces, panes, machine, gone).flatMap(({ id, folder }) =>
    Option.match(Option.fromNullishOr(byId.get(id)), {
      onNone: () => [],
      onSome: (space) => [{ space: id, step: closeOrKeep(space, panes), folder }],
    }),
  );
};

/**
 * The spaces to close at once on the `gone` folders a folder check of dropped paths found
 * on `machine` (as `orphanSpaces` finds them): those where only shells run. Only those
 * folders count, so a space the wider orphan check finds (published for the sidebar) is
 * never closed here.
 */
export const orphanCloses = (
  spaces: readonly SpaceLike[],
  panes: readonly ProgramPane[],
  machine: Machine,
  gone: readonly string[],
): readonly string[] =>
  orphanSpaces(spaces, panes, machine, gone)
    .filter((orphan) => orphan.step === "Close")
    .map((orphan) => orphan.space);

/** A worktree path a list the panel read named, on its machine, and its repo's root there. */
export interface ReadWorktree {
  readonly machine: Machine;
  readonly path: string;
  readonly repo: string;
}

/** Each machine's open spaces' own folders found gone, by the last owners lookup that worked. */
export type GoneFolders = ReadonlyMap<Machine, readonly string[]>;

/**
 * The gone folders after `machine`'s search landed: its own when the search worked, else
 * those its last search found, so a failed lookup never clears its orphan spaces.
 */
export const goneLanded = (
  gone: GoneFolders,
  machine: Machine,
  search: Result.Result<{ readonly gone: readonly string[] }, unknown>,
): GoneFolders =>
  Result.match(search, {
    onFailure: () => gone,
    onSuccess: (found) => new Map([...gone, [machine, found.gone]]),
  });

/**
 * Every worktree path the panel's lists have named, `before` and in `lists` now: a path a
 * list drops stays known, so a space left on it still finds its repo.
 */
export const worktreesRead = (
  before: readonly ReadWorktree[],
  lists: ReadonlyMap<RepoKey, RepoList>,
): readonly ReadWorktree[] => {
  const known = (w: ReadWorktree) =>
    before.some((old) => old.machine === w.machine && old.path === w.path);
  const now = Array.from(lists).flatMap(([key, list]) => {
    const { machine, root } = repoOfKey(key);
    return list.worktrees.map((w): ReadWorktree => ({ machine, path: w.path, repo: root }));
  });
  return [...before, ...now.filter((w) => !known(w))];
};

/** wt's trash folder inside a repo's main checkout: removed worktrees move in there. */
const TRASH = "/.git/wt/trash/";

/**
 * The repo root a place in wt's trash names (`<root>/.git/wt/trash/...`), read from the
 * path alone, so it holds after wt deletes the trashed folder too.
 */
const trashRepo = (place: string): Option.Option<string> => {
  const at = place.indexOf(TRASH);
  return at > 0 ? Option.some(place.slice(0, at)) : Option.none();
};

/**
 * The orphan spaces to publish, by space id: each space whose own folder is in `gone` on
 * its machine and whose repo is known: from its place in wt's trash, else from a list
 * the panel read that named its folder as a worktree there (`read`). Any other gone
 * folder is not an orphan's.
 */
export const publishedOrphans = (
  spaces: readonly SpaceLike[],
  places: readonly Place[],
  gone: GoneFolders,
  read: readonly ReadWorktree[],
): PublishedOrphans => {
  const placeOf = new Map(places.map((p) => [p.space.id, p.place]));
  return Object.fromEntries(
    spaces
      .filter((space) => (gone.get(space.machine) ?? []).includes(space.folder))
      .flatMap((space) =>
        Option.match(
          Option.orElse(
            Option.flatMap(Option.fromNullishOr(placeOf.get(space.id)), trashRepo),
            () =>
              Option.fromNullishOr(
                read.find((w) => w.machine === space.machine && w.path === space.folder)?.repo,
              ),
          ),
          {
            onNone: () => [],
            onSome: (repo) => [[space.id, { folder: space.folder, repo }] as const],
          },
        ),
      ),
  );
};

/**
 * Whether `orphans` differ from those `published` in shared state (anything at all, since
 * any mod can write it): publishing only on a change spares every mod a render. Nothing
 * stored yet counts as none published, so finding none writes nothing.
 */
export const orphansChanged = (orphans: PublishedOrphans, published: unknown): boolean => {
  const entries = Object.entries(orphans);
  const stored = Predicate.isNullish(published) ? {} : published;
  return (
    !Predicate.isObject(stored) ||
    Object.keys(stored).length !== entries.length ||
    entries.some(
      ([space, orphan]) =>
        !Option.exists(
          spaceOrphan(stored, space),
          (was) => was.folder === orphan.folder && was.repo === orphan.repo,
        ),
    )
  );
};
