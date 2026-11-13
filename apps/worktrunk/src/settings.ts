// The panel's settings: a JSON file in Herdr's folder, named after the mod id, that the
// person may edit by hand. Pure: no `herdr` or `gpui` imports.
//
// { "folders": [{ "name": "Work", "path": "~/code/work" },
//               { "name": "Box", "path": "~/code", "machine": "linux" }],
//   "depth": 4, "skip": [...],
//   "hidden": ["/code/work/old-repo", { "machine": "linux", "path": "/srv/old" }],
//   "noWrapper": false }
// Each folder is scanned for repos on its machine and names a group. A folder without
// `machine`, and a hidden repo written as a bare folder, are on this machine.
import { Option, Predicate, Result } from "effect";
import { finite, parseJson } from "worktrunk-mailbox";
import { repoKey, THIS_MACHINE, tildePath, type Machine, type RepoId } from "./machines.ts";

export interface GroupFolder {
  /** The group's name, such as "Work". */
  readonly name: string;
  /** The folder; may start with `~`, that machine's home. No trailing slash. */
  readonly path: string;
  /** The machine the folder is on. */
  readonly machine: Machine;
}

export interface Settings {
  readonly folders: readonly GroupFolder[];
  /** How many folder levels the scan goes down, 1 to 8. */
  readonly depth: number;
  /** Folder names the scan never enters. */
  readonly skip: readonly string[];
  /** Repos the panel leaves out, by machine and main checkout folder. */
  readonly hidden: readonly RepoId[];
  /** Merge and remove call the wt program itself, skipping a shell function named `wt`. */
  readonly noWrapper: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  folders: [],
  depth: 4,
  skip: ["node_modules", ".cache"],
  hidden: [],
  noWrapper: false,
};

export interface ParsedSettings {
  readonly settings: Settings;
  /** Why the file didn't parse, starting with its name; the settings are the defaults then. */
  readonly error: Option.Option<string>;
}

interface FolderEntry {
  readonly name?: string;
  readonly path: string;
  readonly machine?: string;
}

/** A hidden repo as written: a folder on this machine, or a folder on a named machine. */
type HiddenEntry = string | { readonly machine: string; readonly path: string };

/** The file as written, before defaults and clean-up. */
interface SettingsFile {
  readonly folders?: readonly FolderEntry[];
  readonly depth?: number;
  readonly skip?: readonly string[];
  readonly hidden?: readonly HiddenEntry[];
  readonly noWrapper?: boolean;
}

const isFolderEntry = (value: unknown): value is FolderEntry =>
  Predicate.isObject(value) &&
  Predicate.isString(value.path) &&
  (value.name === undefined || Predicate.isString(value.name)) &&
  (value.machine === undefined || Predicate.isString(value.machine));

const isHiddenEntry = (value: unknown): value is HiddenEntry =>
  Predicate.isString(value) ||
  (Predicate.isObject(value) &&
    Predicate.isString(value.machine) &&
    Predicate.isString(value.path));

const listOf = <A>(value: unknown, item: (v: unknown) => v is A): value is readonly A[] =>
  Array.isArray(value) && value.every(item);

/** The file's shape, or what is wrong with it. A wrong shape is never half read. */
const readSettingsFile = (value: unknown): Result.Result<SettingsFile, string> => {
  if (!Predicate.isObject(value)) return Result.fail("expected a JSON object");
  const { folders, depth, skip, hidden, noWrapper } = value;
  if (folders !== undefined && !listOf(folders, isFolderEntry)) {
    return Result.fail('"folders" must be a list of { "name", "path" }');
  }
  if (depth !== undefined && Option.isNone(finite(depth))) {
    return Result.fail('"depth" must be a number');
  }
  if (skip !== undefined && !listOf(skip, Predicate.isString)) {
    return Result.fail('"skip" must be a list of folder names');
  }
  if (hidden !== undefined && !listOf(hidden, isHiddenEntry)) {
    return Result.fail('"hidden" must be a list of repo folders');
  }
  if (noWrapper !== undefined && !Predicate.isBoolean(noWrapper)) {
    return Result.fail('"noWrapper" must be true or false');
  }
  return Result.succeed({
    ...(folders === undefined ? {} : { folders }),
    ...(Predicate.isNumber(depth) ? { depth } : {}),
    ...(skip === undefined ? {} : { skip }),
    ...(hidden === undefined ? {} : { hidden }),
    ...(noWrapper === undefined ? {} : { noWrapper }),
  });
};

/** A folder's last path segment, the name a folder gets when it has none. */
export const lastSegment = (path: string): string =>
  path
    .split("/")
    .filter((part) => part !== "")
    .at(-1) ?? path;

/** `path` with a leading `~` turned into `home`. */
export const expandHome = (path: string, home: string): string =>
  path === "~" ? home : path.startsWith("~/") ? `${home}${path.slice(1)}` : path;

export { tildePath };

const trimSlashes = (path: string): string => path.trim().replace(/\/+$/, "");

const clampDepth = (depth: number): number => Math.min(8, Math.max(1, Math.round(depth)));

const normalize = (file: SettingsFile): Settings => ({
  folders: (file.folders ?? []).flatMap((folder) => {
    const path = trimSlashes(folder.path);
    if (path === "") return [];
    const name = folder.name?.trim() ?? "";
    return [
      {
        name: name === "" ? lastSegment(path) : name,
        path,
        machine: folder.machine ?? THIS_MACHINE,
      },
    ];
  }),
  depth: file.depth === undefined ? DEFAULT_SETTINGS.depth : clampDepth(file.depth),
  skip:
    file.skip === undefined
      ? DEFAULT_SETTINGS.skip
      : file.skip.map((name) => name.trim()).filter((name) => name !== ""),
  hidden: (file.hidden ?? [])
    .map((entry): RepoId =>
      Predicate.isString(entry)
        ? { machine: THIS_MACHINE, root: entry }
        : { machine: entry.machine, root: entry.path },
    )
    .filter((repo) => repo.root !== ""),
  noWrapper: file.noWrapper ?? DEFAULT_SETTINGS.noWrapper,
});

/**
 * The settings in `text` (the file's contents, null when there is none). A file that
 * doesn't parse, or has the wrong shape, gives the defaults and the reason, so the panel
 * keeps working and says why.
 */
export const parseSettings = (text: string | null, fileName: string): ParsedSettings => {
  if (text === null || text.trim() === "") {
    return { settings: DEFAULT_SETTINGS, error: Option.none() };
  }
  return Result.match(Result.flatMap(parseJson(text), readSettingsFile), {
    onSuccess: (file) => ({ settings: normalize(file), error: Option.none() }),
    onFailure: (message) => ({
      settings: DEFAULT_SETTINGS,
      error: Option.some(`${fileName}: ${message}`),
    }),
  });
};

/** What the file holds: a stable key order and two-space indent, so it reads and diffs well. */
export const serializeSettings = ({
  folders,
  depth,
  skip,
  hidden,
  noWrapper,
}: Settings): string => {
  const ordered = {
    folders: folders.map(({ name, path, machine }): FolderEntry =>
      machine === null ? { name, path } : { name, path, machine },
    ),
    depth,
    skip,
    hidden: hidden.map(({ machine, root }): HiddenEntry =>
      machine === null ? root : { machine, path: root },
    ),
    noWrapper,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
};

/** What a settings read does about the old mod's file. */
export interface ImportPlan {
  /** The settings file to create from the old mod's settings; none when nothing is copied. */
  readonly write: Option.Option<string>;
  /**
   * The import is over for good, to be recorded: it was done before, it is done now, or a
   * settings file exists. A settings file deleted later is then never refilled from the
   * old one.
   */
  readonly settled: boolean;
}

/**
 * The one-time import of the old `worktrunk` mod's settings, given the settings file's
 * text (`current`), the old file's (`legacy`), null for no file, and whether the import
 * was settled on an earlier run (`settled`). It never overwrites a settings file.
 */
export const planImport = (
  current: string | null,
  legacy: string | null,
  settled: boolean,
): ImportPlan => {
  if (settled || current !== null) return { write: Option.none(), settled: true };
  const old = parseSettings(legacy, "worktrunk.json");
  return legacy === null || Option.isSome(old.error)
    ? { write: Option.none(), settled: false }
    : { write: Option.some(serializeSettings(old.settings)), settled: true };
};

/**
 * The settings file's text with `repo` (by machine and folder) hidden, from its text now (null when
 * there is none). A file that doesn't parse is never replaced: the result is its error
 * instead, so a hand edit in progress is never lost to the defaults. A repo already
 * hidden leaves the text as it is.
 */
export const hideRepo = (
  current: string | null,
  repo: RepoId,
  fileName: string,
): Result.Result<string, string> => {
  const { settings, error } = parseSettings(current, fileName);
  if (Option.isSome(error)) return Result.fail(error.value);
  if (current !== null && settings.hidden.some((hidden) => repoKey(hidden) === repoKey(repo))) {
    return Result.succeed(current);
  }
  return Result.succeed(serializeSettings({ ...settings, hidden: [...settings.hidden, repo] }));
};

/** What a save from the Settings dialog does. */
export type SavePlan =
  /** Write `text`, only while the file still reads `expected` (null: there is no file). */
  | { readonly _tag: "Write"; readonly text: string; readonly expected: string | null }
  /** Nothing changed: the file stays as it is, hand formatting included. */
  | { readonly _tag: "Unchanged" }
  /** The file changed on disk since the dialog opened: saving would lose that edit. */
  | { readonly _tag: "Changed" }
  /** The file didn't parse when the dialog opened, so it is never replaced. */
  | { readonly _tag: "Broken"; readonly error: string };

/**
 * How to save `settings` from the dialog, given the file's text when the dialog opened
 * (`opened`) and now (`onDisk`), null when there was no file. A hand edit made since the
 * dialog opened is never overwritten: the plan says so instead, and a Write expects the
 * opened text, so an edit landing after this check makes the write fail too.
 */
export const planSave = (
  opened: string | null,
  onDisk: string | null,
  settings: Settings,
  fileName: string,
): SavePlan => {
  const before = parseSettings(opened, fileName);
  if (Option.isSome(before.error)) return { _tag: "Broken", error: before.error.value };
  if (onDisk !== opened) return { _tag: "Changed" };
  const text = serializeSettings(settings);
  if (opened !== null && text === serializeSettings(before.settings)) return { _tag: "Unchanged" };
  return { _tag: "Write", text, expected: opened };
};

/** The settings with `repo` (by machine and folder) no longer hidden. */
export const unhide = (settings: Settings, repo: RepoId): Settings => ({
  ...settings,
  hidden: settings.hidden.filter((hidden) => repoKey(hidden) !== repoKey(repo)),
});

/**
 * The settings with the folder picked at `picked` (on this machine, whose home is `home`)
 * added as the last group, named after its last segment and written with `~` under
 * `home`. A folder already listed on this machine changes nothing.
 */
export const addFolder = (settings: Settings, picked: string, home: string): Settings =>
  withFolder(settings, THIS_MACHINE, picked, home);

/**
 * The settings with `typed` on `machine` (whose home is `home`) added as the last group,
 * named after its last segment and written with `~` under `home`. A blank folder, or one
 * already listed on that machine, changes nothing.
 */
const withFolder = (
  settings: Settings,
  machine: Machine,
  typed: string,
  home: string,
): Settings => {
  const path = tildePath(trimSlashes(typed), home);
  if (path === "") return settings;
  const listed = settings.folders.some(
    (folder) =>
      folder.machine === machine && expandHome(folder.path, home) === expandHome(path, home),
  );
  return listed
    ? settings
    : {
        ...settings,
        folders: [...settings.folders, { name: lastSegment(path), path, machine }],
      };
};

/** The settings with the folder at `index` moved `by` places; past either end, unchanged. */
export const moveFolder = (settings: Settings, index: number, by: number): Settings => {
  const { folders } = settings;
  const to = index + by;
  const inside = (i: number) => i >= 0 && i < folders.length;
  if (by === 0 || !inside(index) || !inside(to)) return settings;
  const moved = folders.slice(index, index + 1);
  const without = folders.filter((_, i) => i !== index);
  return { ...settings, folders: [...without.slice(0, to), ...moved, ...without.slice(to)] };
};

/** The settings without the folder at `index`. */
export const removeFolder = (settings: Settings, index: number): Settings => ({
  ...settings,
  folders: settings.folders.filter((_, i) => i !== index),
});

/** The skip names as the dialog's field shows them. */
export const skipText = (skip: readonly string[]): string => skip.join(", ");

/** What the dialog's text fields hold: one name per folder, in order, the skip list, depth. */
export interface Fields {
  readonly names: readonly string[];
  readonly skip: string;
  readonly depth: number;
}

/**
 * The settings with the dialog's fields applied: names trimmed (a blank one is the
 * folder's last segment), skip names split on commas, depth kept to 1 to 8.
 */
export const withFields = (settings: Settings, fields: Fields): Settings => ({
  ...settings,
  folders: settings.folders.map((folder, i) => {
    const name = (fields.names[i] ?? folder.name).trim();
    return { ...folder, name: name === "" ? lastSegment(folder.path) : name };
  }),
  skip: fields.skip
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== ""),
  depth: clampDepth(fields.depth),
});

/** The machines a group folder can be added on by path: Herdr's machines other than this one. */
export const otherMachines = (list: readonly { readonly name: Machine }[]): readonly string[] =>
  list.flatMap(({ name }) => (name === null ? [] : [name]));

/**
 * The settings with the folder typed as `typed` on `machine` (whose home there is `home`)
 * added as the last group, as `addFolder` adds one on this machine.
 */
export const addFolderOn = (
  settings: Settings,
  machine: string,
  typed: string,
  home: string,
): Settings => withFolder(settings, machine, typed, home);
