#!/bin/sh
# PreToolUse hook (Bash): block direct package-manager calls. This repo goes through `vp`.
cmd=$(jq -r '.tool_input.command // ""')

if printf '%s\n' "$cmd" | grep -Eq '(^|[;&|(`[:space:]])(pnpm|npm|npx|pnpx|yarn|bun|bunx)([[:space:]]|$)'; then
  echo "Blocked: use vp, not pnpm/npm/npx/yarn/bun. See the 'Package management' table in CLAUDE.md (e.g. vp install, vp add, vp exec, vp dlx, vp pm <cmd>)." >&2
  exit 2
fi
exit 0
