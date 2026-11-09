#!/bin/sh
# PostToolUse hook (Edit|Write): format the file Claude just changed, so the Stop hook's
# vp check doesn't fail on formatting. vp fmt skips its ignore lists (mods/, .claude/skills/)
# and files it can't format. Never blocks: a formatting problem surfaces at Stop instead.
file=$(jq -r '.tool_input.file_path // ""')

case "$file" in
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" && vp fmt --no-error-on-unmatched-pattern "$file" >/dev/null 2>&1
exit 0
