#!/bin/sh
# Stop hook: before Claude finishes, run `vp run verify` (checks, every test suite and the
# config audit). On failure, block the stop and hand Claude the output.
#
# It lets a stop through unchecked when:
# - stop_hook_active is set: Claude is already continuing after a block, so the next stop
#   after a block is never checked (no loop);
# - the branch is untouched: a clean tree and HEAD at its merge-base with origin/main;
# - jq is missing: the hook can't read its input, so it says why and steps aside;
# - the hook times out (the `timeout` in .claude/settings.json): Claude Code ends it and
#   the stop goes through.
#
# Commits made during the turn are still checked: the pre-commit hook runs no tests.
if ! command -v jq >/dev/null 2>&1; then
  echo "stop-check: jq not found, so the checks were skipped. Install jq to enable them." >&2
  exit 0
fi

active=$(jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Untouched branch: nothing here differs from main. Without origin/main, run anyway.
if [ -z "$(git status --porcelain)" ]; then
  base=$(git merge-base HEAD origin/main 2>/dev/null)
  [ -n "$base" ] && [ "$base" = "$(git rev-parse HEAD)" ] && exit 0
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
