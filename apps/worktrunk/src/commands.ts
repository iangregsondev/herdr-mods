// The shell scripts the panel runs, and their arguments. Pure: no `herdr` or `gpui`
// imports. Each script reads its inputs as positional arguments ($1, $2, ...), never
// spliced into the script text, so no path or name needs quoting.
import { expandHome } from "./repos.ts";
import type { Settings } from "./settings.ts";

/** The scan's arguments for these settings. */
export const scanArgs = (settings: Settings, home: string): readonly string[] => [
  String(settings.depth),
  settings.skip.map((name) => `/${name}/`).join(""),
  ...settings.folders.map((folder) => expandHome(folder.path, home)),
];

/** argv[0] for `sh -c`: the name the scripts report errors under. */
export const SCRIPT_NAME = "worktrunk";

// The app's environment may lack the folders wt and git are usually installed in.
// Appended, so the person's own PATH order still wins.
const PATH_LINE = 'PATH="$PATH:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin"; export PATH';

/** `body` as the arguments to `sh`: `-c`, the script, its name, then `args` as $1... */
export const shArgs = (body: string, args: readonly string[]): readonly string[] => [
  "-c",
  `${PATH_LINE}\n${body}`,
  SCRIPT_NAME,
  ...args,
];

/**
 * Finds repos under group folders. $1: how deep to go; $2: folder names to skip, each
 * wrapped in slashes ("/node_modules//.cache/"); then the group folders. A folder with a
 * `.git` folder is a repo (a linked worktree's `.git` is a file, so it never counts). It
 * never enters a repo, a symlink, a hidden folder or a skipped name. Prints
 * `group folder<TAB>repo<TAB>worktree count` per repo.
 */
export const SCAN_SCRIPT = `depth=$1; skip=$2; shift 2
walk() {
  local dir=$1 level=$2 child name count
  if [ -d "$dir/.git" ]; then
    count=1
    for child in "$dir"/.git/worktrees/*/; do [ -d "$child" ] && count=$((count + 1)); done
    printf '%s\\t%s\\t%s\\n' "$top" "$dir" "$count"
    return
  fi
  [ "$level" -ge "$depth" ] && return
  for child in "$dir"/*/; do
    child=\${child%/}
    [ -d "$child" ] && [ ! -L "$child" ] || continue
    name=\${child##*/}
    case "$skip" in *"/$name/"*) continue ;; esac
    walk "$child" $((level + 1))
  done
}
for top in "$@"; do top=\${top%/}; walk "$top" 0; done
exit 0`;

/**
 * The repos the given folders are in, through each folder's shared git folder, so a
 * folder inside a linked worktree names its repo too. Prints `repo<TAB>worktree count`.
 */
export const OWNERS_SCRIPT = `for dir in "$@"; do
  [ -d "$dir" ] || continue
  common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || continue
  case "$common" in
    */.git)
      repo=\${common%/.git}
      printf '%s\\t%s\\n' "$repo" "$(git -C "$repo" worktree list --porcelain 2>/dev/null | grep -c '^worktree ')"
      ;;
  esac
done | sort -u`;

/** Lists the worktrees of the repo at $1. */
export const LIST_SCRIPT = 'cd "$1" && wt list --format=json';
