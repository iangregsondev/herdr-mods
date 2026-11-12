// Which repos the panel lists and which group each belongs to. Pure: no `herdr` or `gpui`
// imports. The folder scan and the open spaces' repos are found by shell scripts; this
// module reads their output.
import { Option } from "effect";
import { expandHome, lastSegment, type GroupFolder } from "./settings.ts";

export { expandHome };

/** True when `path` is `root` or inside it. */
export const isUnder = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/** The group of a repo inside no group folder. */
export const OTHER = "Other";

/** The repo's group: the deepest group folder that holds it, else Other. */
export const groupOf = (root: string, folders: readonly GroupFolder[], home: string): string =>
  folders
    .map((folder) => ({ name: folder.name, path: expandHome(folder.path, home) }))
    .filter((folder) => isUnder(root, folder.path))
    .reduce<Option.Option<{ readonly name: string; readonly path: string }>>(
      (best, folder) =>
        Option.isSome(best) && best.value.path.length >= folder.path.length
          ? best
          : Option.some(folder),
      Option.none(),
    )
    .pipe(
      Option.map((folder) => folder.name),
      Option.getOrElse(() => OTHER),
    );

export interface FoundRepo {
  /** The main checkout's folder. */
  readonly root: string;
  /** How many worktrees it has, the main checkout included. */
  readonly count: number;
}

const count = (text: string | undefined): number => {
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

/** The folder scan's output: one `group folder<TAB>repo<TAB>count` line per repo. */
export const parseScan = (stdout: string): readonly FoundRepo[] =>
  stdout.split("\n").flatMap((line) => {
    const [, root, n] = line.split("\t");
    return root ? [{ root, count: count(n) }] : [];
  });

/** The open spaces' repos: one `repo<TAB>count` line per repo. */
export const parseOwners = (stdout: string): readonly FoundRepo[] =>
  stdout.split("\n").flatMap((line) => {
    const [root, n] = line.split("\t");
    return root && line.includes("\t") ? [{ root, count: count(n) }] : [];
  });

/** The Current repo: the repo the owners script names for the focused folder, if any. */
export const currentRepo = (stdout: string): Option.Option<FoundRepo> =>
  Option.fromNullishOr(parseOwners(stdout)[0]);

export interface Repo extends FoundRepo {
  readonly group: string;
}

/**
 * Every repo once, scanned or from an open space, with its group, by folder name.
 * An open space's count is fresher than the scan's, so it wins.
 */
export const reposFrom = (
  scanned: readonly FoundRepo[],
  owners: readonly FoundRepo[],
  folders: readonly GroupFolder[],
  home: string,
): readonly Repo[] =>
  Array.from(new Map([...scanned, ...owners].map((repo) => [repo.root, repo.count])))
    .map(([root, n]) => ({ root, count: n, group: groupOf(root, folders, home) }))
    .sort((a, b) => lastSegment(a.root).localeCompare(lastSegment(b.root)));

/** `repos` without the hidden ones (by main checkout folder), in their order. */
export const withoutHidden = <R extends FoundRepo>(
  repos: readonly R[],
  hidden: readonly string[],
): readonly R[] => repos.filter((repo) => !hidden.includes(repo.root));
