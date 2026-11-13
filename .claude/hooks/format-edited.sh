#!/bin/sh
# PostToolUse hook (Edit|Write): format the file Claude just changed, so the Stop hook's
# vp check doesn't fail on formatting. vp fmt skips its ignore lists (mods/, .claude/skills/)
# and files it can't format. It never blocks: the edit always stands.
#
# It steps aside, leaving the file unformatted, when:
# - jq is missing: the hook can't read its input. It says so on stderr and exits 1,
#   Claude Code's non-blocking error, so the user sees why at once;
# - the input names no file, or a file outside the project: there is nothing of ours to
#   format (exit 0);
# - vp is missing: not on PATH and in none of the Vite+ bin folders (find-vp.sh). It says
#   so on stderr and exits 1;
# - vp fmt itself fails: its error goes to stderr and the hook still exits 0, so the
#   problem surfaces at Stop as well.

# The hook's own folder, found before the cd below so a relative $0 still resolves.
case $0 in
  */*) hook_dir=$(cd -- "${0%/*}" && pwd) ;;
  *) hook_dir=$(pwd) ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  echo "format-edited.sh: jq not found (looked on PATH), so the edited file was not formatted." >&2
  exit 1
fi

file=$(jq -r '.tool_input.file_path // ""')

case "$file" in
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

. "$hook_dir/find-vp.sh"
if ! command -v vp >/dev/null 2>&1; then
  echo "format-edited.sh: vp not found (looked on PATH and in the Vite+ bin folders), so the edited file was not formatted." >&2
  exit 1
fi

# stdout is vp fmt's progress chatter; stderr carries vp fmt's real errors.
cd "$CLAUDE_PROJECT_DIR" && vp fmt --no-error-on-unmatched-pattern "$file" >/dev/null
exit 0
