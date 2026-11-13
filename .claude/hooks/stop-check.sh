#!/bin/sh
# Stop hook: before Claude finishes, run `vp run verify` (checks, every test suite and the
# config audit). On failure, block the stop (exit 2) and hand Claude the output.
#
# It steps aside, letting the stop through unchecked, when:
# - jq is missing: the hook can't read its input. It says so on stderr and exits 1,
#   Claude Code's non-blocking error, so the user sees why;
# - stop_hook_active is set: Claude is already continuing after a block, so the next stop
#   after a block is never checked (no loop);
# - the project folder can't be entered: there is nothing to check;
# - the branch is untouched: a clean tree and HEAD at its merge-base with origin/main;
# - vp is missing: not on PATH and in none of the Vite+ bin folders (find-vp.sh). It says
#   so on stderr and exits 1, so a missing tool never reads as failing checks;
# - the hook times out (the `timeout` in .claude/settings.json): Claude Code ends it and
#   the stop goes through.
#
# A skipped stop never needs vp: the lookup comes after every skip.
# Commits made during the turn are still checked: the pre-commit hook runs no tests.

# The hook's own folder, found before the cd below so a relative $0 still resolves.
case $0 in
  */*) hook_dir=$(cd -- "${0%/*}" && pwd) ;;
  *) hook_dir=$(pwd) ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  echo "stop-check: jq not found (looked on PATH), so the checks were skipped." >&2
  exit 1
fi

active=$(jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Untouched branch: nothing here differs from main. Without origin/main, run anyway.
if [ -z "$(git status --porcelain)" ]; then
  base=$(git merge-base HEAD origin/main 2>/dev/null)
  [ -n "$base" ] && [ "$base" = "$(git rev-parse HEAD)" ] && exit 0
fi

. "$hook_dir/find-vp.sh"
if ! command -v vp >/dev/null 2>&1; then
  echo "stop-check: vp not found (looked on PATH and in the Vite+ bin folders), so the checks were skipped." >&2
  exit 1
fi

if out=$(vp run verify 2>&1); then
  exit 0
fi

{
  echo "Checks fail. If this turn changed these files, fix them; otherwise say what fails and why."
  lines=$(printf '%s\n' "$out" | wc -l)
  if [ "$lines" -le 60 ]; then
    printf '%s\n' "$out"
  else
    printf '%s\n' "$out" | head -20
    echo "... ($((lines - 60)) lines cut) ..."
    printf '%s\n' "$out" | tail -40
  fi
} >&2
exit 2
