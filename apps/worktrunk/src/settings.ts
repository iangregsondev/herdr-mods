// The panel's settings: a JSON file in Herdr's folder, named after the mod id, that the
// person may edit by hand. Pure: no `herdr` or `gpui` imports.
//
// { "folders": [{ "name": "Work", "path": "~/code/work" }], "depth": 4, "skip": [...],
//   "hidden": ["/code/work/old-repo"], "noWrapper": false }
// Each folder is scanned for repos and names a group.
import { Option, Predicate, Result } from "effect";
import { finite, parseJson } from "./json.ts";

export interface GroupFolder {
  /** The group's name, such as "Work". */
  readonly name: string;
  /** The folder; may start with `~`. No trailing slash. */
  readonly path: string;
}

export interface Settings {
  readonly folders: readonly GroupFolder[];
  /** How many folder levels the scan goes down, 1 to 8. */
  readonly depth: number;
  /** Folder names the scan never enters. */
  readonly skip: readonly string[];
  /** Repos (main checkout folders) the panel leaves out. */
  readonly hidden: readonly string[];
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
}

/** The file as written, before defaults and clean-up. */
interface SettingsFile {
  readonly folders?: readonly FolderEntry[];
  readonly depth?: number;
  readonly skip?: readonly string[];
  readonly hidden?: readonly string[];
  readonly noWrapper?: boolean;
}

const isFolderEntry = (value: unknown): value is FolderEntry =>
  Predicate.isObject(value) &&
  Predicate.isString(value.path) &&
  (value.name === undefined || Predicate.isString(value.name));

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
  if (hidden !== undefined && !listOf(hidden, Predicate.isString)) {
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

const trimSlashes = (path: string): string => path.trim().replace(/\/+$/, "");

const clampDepth = (depth: number): number => Math.min(8, Math.max(1, Math.round(depth)));

const normalize = (file: SettingsFile): Settings => ({
  folders: (file.folders ?? []).flatMap((folder) => {
    const path = trimSlashes(folder.path);
    if (path === "") return [];
    const name = folder.name?.trim() ?? "";
    return [{ name: name === "" ? lastSegment(path) : name, path }];
  }),
  depth: file.depth === undefined ? DEFAULT_SETTINGS.depth : clampDepth(file.depth),
  skip:
    file.skip === undefined
      ? DEFAULT_SETTINGS.skip
      : file.skip.map((name) => name.trim()).filter((name) => name !== ""),
  hidden: (file.hidden ?? DEFAULT_SETTINGS.hidden).filter((root) => root !== ""),
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
    folders: folders.map(({ name, path }) => ({ name, path })),
    depth,
    skip,
    hidden,
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
 * The settings file's text with the repo at `root` hidden, from its text now (null when
 * there is none). A file that doesn't parse is never replaced: the result is its error
 * instead, so a hand edit in progress is never lost to the defaults. A repo already
 * hidden leaves the text as it is.
 */
export const hideRepo = (
  current: string | null,
  root: string,
  fileName: string,
): Result.Result<string, string> => {
  const { settings, error } = parseSettings(current, fileName);
  if (Option.isSome(error)) return Result.fail(error.value);
  if (current !== null && settings.hidden.includes(root)) return Result.succeed(current);
  return Result.succeed(serializeSettings({ ...settings, hidden: [...settings.hidden, root] }));
};
