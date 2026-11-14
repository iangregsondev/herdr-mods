// Orphan spaces: spaces left on worktrees removed outside the panel. Which worktree paths
// a fresh list read dropped, which wait for a folder check on their machine, and whether a
// space on a gone folder closes at once or is asked about. Pure: no `herdr` or `gpui`
// imports.
import { Option, Result } from "effect";
import type { Machine, RepoKey } from "./machines.ts";
import type { MachineLists, RepoList } from "./reads.ts";
import { goneSpaces, type PaneLike, type SpaceLike } from "./spaces.ts";

/** What the panel remembers about worktree paths dropped from their repo's list. */
export interface Orphans {
  /** The dropped paths on each machine, waiting for a folder check there to answer. */
  readonly waiting: ReadonlyMap<Machine, readonly string[]>;
  /** The folders the panel's own jobs removed on each machine, left out of dropped paths. */
  readonly removed: ReadonlyMap<Machine, readonly string[]>;
  /** The spaces already offered for closing by a toast: never offered again. */
  readonly asked: ReadonlySet<string>;
}

export const NO_ORPHANS: Orphans = { waiting: new Map(), removed: new Map(), asked: new Set() };

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
      gone: gone.filter(
        (path) => asked.includes(path) && waitingOn(orphans, machine).includes(path),
      ),
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
  /** The gone folder the space was matched by. */
  readonly folder: string;
}

/**
 * The orphan spaces on `machine`: every space there on one of the `gone` folders (by
 * folder or place, as `goneSpaces` matches them), each closed or asked about, with the
 * gone folder it was matched by.
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
      onSome: (space) => [{ space: id, step: closeOrAsk(space, panes), folder }],
    }),
  );
};

/** The parts of a `SpaceInfo` the ask toast reads. */
export interface NamedSpace extends SpaceLike {
  readonly name: string;
}

/**
 * How long the toast offering to close an orphan space stays up: a day. Herdr fades a
 * toast with no timeout (or a zero one) within seconds and has no "until dismissed", so a
 * day stands in for it.
 */
const ASK_TIMEOUT = 24 * 60 * 60 * 1000;

/** A toast offering to close an orphan space, shaped for `notify`. */
export interface AskToast {
  readonly title: string;
  readonly body: string;
  readonly level: "warning";
  readonly timeout: number;
  readonly action: {
    readonly name: "space.close";
    readonly args: { readonly id: string; readonly confirmed: false };
  };
}

/**
 * The toasts for the `found` orphan spaces where something other than a shell runs and
 * no toast has asked before: each names the space and the gone folder it was matched by,
 * and clicking it closes the space after Herdr's own confirm. The spaces asked about are
 * remembered, so a later check never asks again.
 */
export const askToasts = (
  orphans: Orphans,
  spaces: readonly NamedSpace[],
  found: readonly Orphan[],
): { readonly orphans: Orphans; readonly toasts: readonly AskToast[] } => {
  const names = new Map(spaces.map((space) => [space.id, space.name]));
  const asks = found.filter((orphan) => orphan.step === "Ask" && !orphans.asked.has(orphan.space));
  const toasts = asks.flatMap((orphan) =>
    Option.match(Option.fromNullishOr(names.get(orphan.space)), {
      onNone: (): readonly AskToast[] => [],
      onSome: (name): readonly AskToast[] => [
        {
          title: "Space on a removed worktree",
          body: `${name} is on ${orphan.folder}, which is gone. Something is still running in it. Click to close it.`,
          level: "warning",
          timeout: ASK_TIMEOUT,
          action: { name: "space.close", args: { id: orphan.space, confirmed: false } },
        },
      ],
    }),
  );
  return {
    orphans: {
      ...orphans,
      asked: new Set([...orphans.asked, ...asks.map((orphan) => orphan.space)]),
    },
    toasts,
  };
};

/** What a folder check's gone folders lead to on its machine. */
export interface OrphanSteps {
  readonly orphans: Orphans;
  /** The spaces to close at once. */
  readonly closes: readonly string[];
  /** The toasts asking about the others. */
  readonly toasts: readonly AskToast[];
}

/**
 * The orphan spaces on the `gone` folders on `machine` (as `orphanSpaces` finds them):
 * those where only shells run close at once, the others get an ask toast (`askToasts`).
 */
export const orphanSteps = (
  orphans: Orphans,
  spaces: readonly NamedSpace[],
  panes: readonly ProgramPane[],
  machine: Machine,
  gone: readonly string[],
): OrphanSteps => {
  const found = orphanSpaces(spaces, panes, machine, gone);
  return {
    ...askToasts(orphans, spaces, found),
    closes: found.filter((orphan) => orphan.step === "Close").map((orphan) => orphan.space),
  };
};
