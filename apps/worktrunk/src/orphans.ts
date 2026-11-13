// Orphan spaces: spaces left on worktrees removed outside the panel. Which worktree paths
// a fresh list read dropped, which wait for a folder check on their machine, and whether a
// space on a gone folder closes at once or is asked about. Pure: no `herdr` or `gpui`
// imports.
import { Result } from "effect";
import type { Machine, RepoKey } from "./machines.ts";
import type { MachineLists, RepoList } from "./reads.ts";
import { spacesInGone, type PaneLike, type SpaceLike } from "./spaces.ts";

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

/** The panel's own job removed the folders `gone` on `machine`: never dropped paths. */
export const jobRemoved = (
  orphans: Orphans,
  machine: Machine,
  gone: readonly string[],
): Orphans => ({
  ...orphans,
  removed: new Map([
    ...orphans.removed,
    [machine, [...(orphans.removed.get(machine) ?? []), ...gone]],
  ]),
});

/**
 * What the panel remembers after `machine`'s batched list read answers, given each repo's
 * list from before (`old`).
 */
export const listsRead = (
  orphans: Orphans,
  old: ReadonlyMap<RepoKey, RepoList>,
  machine: Machine,
  answer: MachineLists,
): Orphans => {
  const dropped = Result.match(answer, {
    onFailure: (): readonly string[] => [],
    onSuccess: (lists) =>
      Array.from(lists).flatMap(([key, list]) =>
        Result.match(list, {
          onFailure: (): readonly string[] => [],
          onSuccess: (worktrees) => {
            const now = new Set(worktrees.map((w) => w.path));
            return (old.get(key)?.worktrees ?? [])
              .map((w) => w.path)
              .filter((path) => !now.has(path));
          },
        }),
      ),
  });
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
      [machine, removed.filter((path) => !dropped.includes(path))],
    ]),
  };
};

/**
 * The folder check of the paths `asked` on `machine` answered: the folders it found gone,
 * or why it failed. Gone paths come back for their spaces to close or be asked about; a
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
      gone: gone.filter((path) => asked.includes(path)),
    }),
  });

/** The parts of a `PaneInfo` close-or-ask reads. */
export interface ProgramPane extends PaneLike {
  /** Null for a mod pane, which has no program. */
  readonly terminal: string | null;
  /** What the terminal runs; Herdr leaves it out of a mod pane. */
  readonly program?: { readonly shell: boolean };
}

/**
 * What happens to a space on a gone folder: `Close` at once when every terminal in it
 * runs a plain shell (mod panes don't count), else `Ask` first, since closing would end
 * whatever else runs there.
 */
export type CloseOrAsk = "Close" | "Ask";

export const closeOrAsk = (space: SpaceLike, panes: readonly ProgramPane[]): CloseOrAsk => {
  const tabs = new Set(space.tabs.map((tab) => tab.id));
  return panes
    .filter((pane) => tabs.has(pane.tab) && pane.terminal !== null)
    .every((pane) => pane.program?.shell === true)
    ? "Close"
    : "Ask";
};

/** A space on a gone folder, and what happens to it. */
export interface Orphan {
  readonly space: string;
  readonly step: CloseOrAsk;
}

/**
 * The orphan spaces on `machine`: every space there on one of the `gone` folders (by
 * folder or place, as `spacesInGone` matches them), each closed or asked about.
 */
export const orphanSpaces = (
  spaces: readonly SpaceLike[],
  panes: readonly ProgramPane[],
  machine: Machine,
  gone: readonly string[],
): readonly Orphan[] => {
  const ids = new Set(spacesInGone(spaces, panes, machine, gone));
  return spaces
    .filter((space) => ids.has(space.id))
    .map((space) => ({ space: space.id, step: closeOrAsk(space, panes) }));
};
