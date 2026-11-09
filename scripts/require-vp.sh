#!/bin/sh
# preinstall: refuse installs that don't come through vp. Another package manager writes
# its own lockfile and node_modules layout. vp sets VP_PATH_INJECTED_TOOLS for the package
# manager it runs, and the variable reaches lifecycle scripts; a plain shell doesn't have it.
# (VP_HOME won't do: shell profiles set it everywhere. VP_CLI_BIN doesn't reach scripts.)
[ -n "$VP_PATH_INJECTED_TOOLS" ] && exit 0

echo "This repo installs through vp: run 'vp install' (or 'vp add <pkg>'). See 'Package management' in CLAUDE.md." >&2
exit 1
