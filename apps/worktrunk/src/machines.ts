// Which machine a repo lives on, and the key a repo is known by. Pure: no `herdr` or
// `gpui` imports.
import { Option } from "effect";

/** A machine as Herdr names it (`hc machine ls`); null is this machine, as in `SpaceInfo`. */
export type Machine = string | null;

/** This machine: the one the Herdr app runs on. */
export const THIS_MACHINE: Machine = null;

/** What the panel calls `machine`: Herdr's name for it, or "this machine". */
export const machineName = (machine: Machine): string => machine ?? "this machine";

/** Each machine's home folder, read on that machine. */
export type Homes = ReadonlyMap<Machine, string>;

/** A folder on a machine. */
export interface Located {
  readonly machine: Machine;
  readonly folder: string;
}

/** A repo's identity: the machine it lives on and its main checkout's folder there. */
export interface RepoId {
  readonly machine: Machine;
  readonly root: string;
}

/**
 * The key a repo is kept under (lists, CI, folded state): its folder on this machine, else
 * `<machine>:<folder>`. A folder is absolute, so no key from another machine starts with
 * `/` the way this machine's do.
 */
export const repoKey = (repo: RepoId): string =>
  repo.machine === null ? repo.root : `${repo.machine}:${repo.root}`;

/**
 * The repo a `repoKey` names. Herdr's machine names never hold `/` (its ids use
 * `<machine>/` as a prefix), so the first `/` starts the folder.
 */
export const repoOfKey = (key: string): RepoId => {
  const slash = key.indexOf("/");
  return slash <= 0
    ? { machine: THIS_MACHINE, root: key }
    : { machine: key.slice(0, slash - 1), root: key.slice(slash) };
};

/** A machine's layout document as Herdr's machine list gives it. */
export type MachineState = "loading" | "ready" | "unavailable";

/** Each machine's state, by machine. */
export type MachineStates = ReadonlyMap<Machine, MachineState>;

/** Herdr's machine list (`machines()`) by machine. */
export const machineStates = (
  list: readonly { readonly name: Machine; readonly layout: MachineState }[],
): MachineStates => new Map(list.map((machine) => [machine.name, machine.layout]));

/** Why the panel can't read a machine now: still connecting, or down with a reason. */
export type MachineStatus =
  | { readonly _tag: "Connecting" }
  | { readonly _tag: "Down"; readonly reason: string };

/**
 * What a machine's state says before anything runs there; none when it can be read. This
 * machine is always read: its commands run here, whatever its layout's state.
 */
export const statusOf = (states: MachineStates, machine: Machine): Option.Option<MachineStatus> => {
  switch (machine === THIS_MACHINE ? "ready" : states.get(machine)) {
    case "loading":
      return Option.some({ _tag: "Connecting" });
    case "unavailable":
      return Option.some({ _tag: "Down", reason: "Herdr can't reach it" });
    default:
      return Option.none();
  }
};
