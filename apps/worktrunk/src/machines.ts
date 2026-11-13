// Which machine a repo lives on, and the key a repo is known by. Pure: no `herdr` or
// `gpui` imports.

/** A machine as Herdr names it (`hc machine ls`); null is this machine, as in `SpaceInfo`. */
export type Machine = string | null;

/** This machine: the one the Herdr app runs on. */
export const THIS_MACHINE: Machine = null;

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
