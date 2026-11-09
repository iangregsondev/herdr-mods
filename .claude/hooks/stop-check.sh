#!/bin/sh
# Stop hook: before Claude finishes, run the checks and tests. On failure, block the stop
# once and hand Claude the output. stop_hook_active is set when Claude is already
# continuing from this hook, so a second failure lets it stop instead of looping.
active=$(jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Nothing changed since the last commit: the commit hook already checked it.
[ -z "$(git status --porcelain)" ] && exit 0

out=$( { vp check && vp run -r test && vp run test && vp run audit:config; } 2>&1 )
[ $? -eq 0 ] && exit 0

{
  echo "Checks or tests fail. Fix them before finishing, or say why they can't pass."
  printf '%s\n' "$out" | tail -40
} >&2
exit 2
