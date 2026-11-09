#!/bin/sh
# PostToolUse hook (Edit|Write): format the file Claude just changed, so the Stop hook's
# vp check doesn't fail on formatting. vp fmt skips its ignore lists (mods/, .claude/skills/)
# and files it can't format. Never blocks (always exits 0), but never fails silently either:
# when it can't format, the reason goes to stderr, and the problem surfaces at Stop as well.
if ! command -v jq >/dev/null 2>&1; then
  echo "format-edited.sh: jq not found on PATH, so the edited file was not formatted. Install jq." >&2
  exit 0
fi

file=$(jq -r '.tool_input.file_path // ""')

case "$file" in
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

# stdout is vp fmt's progress chatter; stderr carries real errors (including a missing vp).
cd "$CLAUDE_PROJECT_DIR" && vp fmt --no-error-on-unmatched-pattern "$file" >/dev/null
exit 0
