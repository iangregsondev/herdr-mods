#!/bin/sh
# Worktree hook (.config/wt.toml): copy the dev target (herdr-dev.json, git-ignored) from
# the main checkout into a new worktree, so the worktree targets the same Herdr host.
# No file in the main checkout means the local dev target: nothing to copy. A file the
# worktree already has is its own choice and is kept, so running the hook again is safe.
# Usage: copy-dev-config.sh <main checkout> <new worktree>
[ -f "$1/herdr-dev.json" ] || exit 0
[ -e "$2/herdr-dev.json" ] && exit 0
cp "$1/herdr-dev.json" "$2/herdr-dev.json"
