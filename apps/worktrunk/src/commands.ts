// The shell scripts the panel runs, and their arguments. Pure: no `herdr` or `gpui`
// imports. Each script reads its inputs as positional arguments ($1, $2, ...), never
// spliced into the script text, so no path or name needs quoting.
import { Option, Predicate, Result } from "effect";
import { at, finite, parseJson, text } from "worktrunk-mailbox";
import type { Homes, Machine } from "./machines.ts";
import { folderOn } from "./repos.ts";
import type { Settings } from "./settings.ts";

/** The scan's arguments for these settings' group folders on `machine`, `~` from `homes`. */
export const scanArgs = (settings: Settings, machine: Machine, homes: Homes): readonly string[] => [
  String(settings.depth),
  settings.skip.map((name) => `/${name}/`).join(""),
  ...settings.folders
    .filter((folder) => folder.machine === machine)
    .flatMap((folder) => Option.toArray(folderOn(folder, homes))),
];

/** argv[0] for `sh -c`: the name the scripts report errors under. */
export const SCRIPT_NAME = "worktrunk";

// Every script runs with the PATH of the machine's login shell ($SHELL -l), so the
// person's own tool setup (mise, Homebrew, ~/.local/bin) applies on whichever machine
// it runs. The PATH is printed last, after a newline, so anything the profile prints
// first is dropped.
const LOGIN_PATH = `[ -n "$SHELL" ] || {
  printf '%s\\n' "worktrunk: \\$SHELL is empty, so the login shell's PATH is unknown" >&2
  exit 127
}
nl='
'
login_path=$("$SHELL" -l -c 'printf "\\n%s" "$PATH"') || exit
PATH=\${login_path##*"$nl"}; export PATH`;

/** `body` as the arguments to `sh`: `-c`, the script, its name, then `args` as $1... */
export const shArgs = (body: string, args: readonly string[]): readonly string[] => [
  "-c",
  `${LOGIN_PATH}\n${body}`,
  SCRIPT_NAME,
  ...args,
];

/**
 * Finds repos under group folders. $1: how deep to go; $2: folder names to skip, each
 * wrapped in slashes ("/node_modules//.cache/"); then the group folders. A folder with a
 * `.git` folder is a repo (a linked worktree's `.git` is a file, so it never counts). It
 * never enters a repo, a symlink, a hidden folder or a skipped name. Prints
 * `group folder<TAB>repo<TAB>worktree count` per repo, and a group folder that doesn't
 * exist alone on its line.
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
for top in "$@"; do
  top=\${top%/}
  if [ -d "$top" ]; then walk "$top" 0; else printf '%s\\n' "$top"; fi
done
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

/** How many repos the batched list reads at once. */
const LISTS_AT_ONCE = 4;

/**
 * Lists the worktrees of every repo in the arguments, in one run: a few repos at a time,
 * each answer kept in a private temp folder, then printed in the arguments' order. Each
 * repo's record starts with the ASCII record separator, then `<exit code><TAB><folder>`
 * on its own line, then what \`wt list --format=json\` printed: its JSON, or its errors
 * when it failed.
 */
export const LISTS_SCRIPT = `tmp=$(mktemp -d) || exit
trap 'rm -rf "$tmp"' EXIT
i=0
for repo in "$@"; do
  i=$((i + 1))
  { (cd "$repo" && wt list --format=json) >"$tmp/$i.out" 2>"$tmp/$i.err"; echo $? >"$tmp/$i.code"; } &
  [ $((i % ${LISTS_AT_ONCE})) -eq 0 ] && wait
done
wait
i=0
rs=$(printf '\\036')
for repo in "$@"; do
  i=$((i + 1))
  code=$(cat "$tmp/$i.code" 2>/dev/null) || code=127
  printf '%s%s\\t%s\\n' "$rs" "$code" "$repo"
  if [ "$code" = 0 ]; then cat "$tmp/$i.out"; else cat "$tmp/$i.err"; fi
done`;

/** Lists the worktrees of the repo at $1 with their CI. */
export const CI_SCRIPT = `${LIST_SCRIPT} --full`;

/** The local and origin branches of the repo at $1, one full ref name per line. */
export const BRANCHES_SCRIPT =
  "git -C \"$1\" for-each-ref '--format=%(refname)' refs/heads refs/remotes/origin";

/** The branch the folder at $1 is on; nothing when its HEAD is detached. */
export const BRANCH_SCRIPT = 'git -C "$1" branch --show-current';

/** `word` as one literal shell word: single-quoted, with each `'` closed, escaped and reopened. */
export const quote = (word: string): string => `'${word.replaceAll("'", "'\\''")}'`;

/** How a job calls wt. */
export interface WtOptions {
  /**
   * Call the wt program itself (`command wt`), skipping any shell function named `wt`
   * the person's shell defines, such as a wrapper that fetches a token.
   */
  readonly noWrapper: boolean;
}

const wt = ({ noWrapper }: WtOptions): string => (noWrapper ? "command wt" : "wt");

/** Removes `branches` (names or worktree paths) of the repo whose main checkout is `main`. */
export const removeScript = (
  main: string,
  branches: readonly string[],
  options: WtOptions,
): string =>
  [wt(options), "-C", quote(main), "remove", "--foreground", ...branches.map(quote)].join(" ");

/** A worktree other than the main checkout, with the repo it belongs to. */
export interface Linked {
  /** The machine the repo lives on; its folders are there. */
  readonly machine: Machine;
  /** The repo's main checkout. */
  readonly main: string;
  /** The worktree's folder. */
  readonly path: string;
  readonly branch: string;
}

/** "squash" folds the branch into one commit on main; "keep" keeps every commit. */
export type MergeMode = "squash" | "keep";

/**
 * Merges the worktree into the default branch, then removes it. The merge runs inside
 * the worktree; the removal runs from the main checkout and waits until it is done, so
 * the worktree's folder is gone when the job ends.
 */
export const mergeScript = (target: Linked, mode: MergeMode, options: WtOptions): string =>
  [
    [wt(options), "-C", quote(target.path), "merge", "--no-remove"]
      .concat(mode === "keep" ? ["--no-squash"] : [])
      .join(" "),
    removeScript(target.main, [target.branch], options),
  ].join(" && ");

/** One repo's worktrees to remove. */
export interface Batch {
  /** The machine the repo lives on. */
  readonly machine: Machine;
  readonly main: string;
  readonly branches: readonly string[];
  /** The worktrees' folders, to close their spaces once they are gone. */
  readonly paths: readonly string[];
}

/**
 * Removes every batch, each repo's name in bold first. A repo that fails doesn't stop the rest; the script fails at the
 * end if any did. Needs an sh-compatible shell.
 */
export const cleanupScript = (batches: readonly Batch[], options: WtOptions): string =>
  [
    "fail=0",
    ...batches.flatMap((batch) => [
      `printf '\\033[1m%s\\033[0m\\n' ${quote(batch.main)}`,
      `${removeScript(batch.main, batch.branches, options)} || fail=1`,
    ]),
    '[ "$fail" -eq 0 ]',
  ].join("\n");

/** wt's own names for a branch: `^`, `-`, `@`, `pr:N`, `mr:N` or a PR/MR link. */
export const isShortcut = (name: string): boolean =>
  /^([\^@-]|(pr|mr):\d+|https?:\/\/\S+)$/.test(name);

export interface NewWorktree {
  /** The repo's main checkout. */
  readonly main: string;
  /** A branch name or a wt shortcut. */
  readonly name: string;
  /** The branch a new branch starts from; none for wt's default branch. */
  readonly base: Option.Option<string>;
  /** Where wt's JSON answer (`{ action, branch, path }`) is written. */
  readonly out: string;
}

/**
 * Switches to the worktree for `name`, creating the branch and worktree when needed,
 * and writes wt's JSON answer to `out`. A branch that exists locally or on origin is
 * switched to; any other name is created from the base. Shortcuts go to wt unchanged.
 */
export const newScript = ({ main, name, base, out }: NewWorktree): string => {
  const switchTo = (args: readonly string[]) =>
    ["wt", "-C", quote(main), "switch", ...args, "--no-cd", "--format=json", ">", quote(out)].join(
      " ",
    );
  if (isShortcut(name)) return switchTo([quote(name)]);
  const exists = ["heads", "remotes/origin"]
    .map(
      (refs) => `git -C ${quote(main)} show-ref --verify --quiet ${quote(`refs/${refs}/${name}`)}`,
    )
    .join(" || ");
  const create = [
    "--create",
    quote(name),
    ...Option.match(base, { onNone: () => [], onSome: (b) => ["--base", quote(b)] }),
  ];
  return `if ${exists}; then\n  ${switchTo([quote(name)])}\nelse\n  ${switchTo(create)}\nfi`;
};

/**
 * Runs a job under `sh`. $1: the person's shell; $2: the job's script, run in that shell
 * as a login, interactive shell so its own `wt` and environment apply. On success it says
 * Done and ends a second later; on failure it shows the exit code and waits for Enter, so
 * the job's window stays open to be read. It exits with the job's code.
 */
export const JOB_SCRIPT = `"$1" -l -i -c "$2"
rc=$?
if [ "$rc" -eq 0 ]; then
  printf '\\n\\033[32mDone.\\033[0m\\n'
  sleep 1
else
  printf '\\n\\033[31mFailed (exit %s). Press Enter to close.\\033[0m\\n' "$rc"
  read -r _
fi
exit "$rc"`;

/** Prints each folder argument that no longer exists, one per line. */
export const GONE_SCRIPT = `for dir in "$@"; do [ -e "$dir" ] || printf '%s\\n' "$dir"; done`;

export interface Job {
  /** The folder the job starts in. */
  readonly cwd: string;
  /** The person's shell, such as /bin/zsh. */
  readonly shell: string;
  /** The script to run in it. */
  readonly body: string;
  /** The machine it runs on: the folder and the shell are that machine's. */
  readonly on: Machine;
}

/**
 * `hc` arguments that start `job` as a background terminal, printing its address as
 * JSON. A job on another machine starts there (`--on`); this machine's needs no flag.
 */
export const jobArgs = ({ cwd, shell, body, on }: Job): readonly string[] => [
  "run",
  "--json",
  "--bg",
  "--no-parent",
  ...(on === null ? [] : ["--on", on]),
  "--cwd",
  cwd,
  "--",
  "sh",
  "-c",
  JOB_SCRIPT,
  SCRIPT_NAME,
  shell,
  body,
];

const json = (output: string): Option.Option<unknown> => Result.getSuccess(parseJson(output));

/** The terminal address `hc run --json` printed for a started job. */
export const startedAddress = (output: string): Option.Option<string> =>
  Option.flatMap(json(output), (value) => text(at(value, "address")));

/** What `hc wait --json` saw. */
export type WaitResult =
  | { readonly _tag: "Ended"; readonly code: number }
  /** The wait timed out with the job still running. */
  | { readonly _tag: "Running" }
  /** hc printed no answer, so the terminal is gone or hc failed. */
  | { readonly _tag: "Lost" };

/** `hc wait --json` output read. A job ended by a signal has no exit code: it counts as 1. */
export const waitResult = (output: string): WaitResult =>
  Option.match(Option.filter(json(output), Predicate.isObject), {
    onNone: (): WaitResult => ({ _tag: "Lost" }),
    onSome: (value): WaitResult =>
      value.ended === true
        ? { _tag: "Ended", code: Option.getOrElse(finite(value.exit_code), () => 1) }
        : { _tag: "Running" },
  });

/** The worktree `wt switch --format=json` switched to or made. */
export const switchedTo = (
  output: string,
): Option.Option<{ readonly branch: string; readonly path: string }> =>
  Option.flatMap(json(output), (value) =>
    Option.all({ branch: text(at(value, "branch")), path: text(at(value, "path")) }),
  );
