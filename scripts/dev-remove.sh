#!/bin/sh
# Removes a mod's dev build from the Herdr app: <app home>/mods/<name>/, made by `vp run <name>#dev`.
# Only removes a folder carrying the dev marker (see mod-pack.ts). A real installed mod is left alone.
#
#   sh scripts/dev-remove.sh <name>
set -eu

[ $# -eq 1 ] || { echo "usage: sh scripts/dev-remove.sh <name>" >&2; exit 2; }
name="$1"
case "$name" in
  "" | */* | .*) echo "dev-remove: bad mod name: $name" >&2; exit 2 ;;
esac

dir="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/$name"

if [ ! -e "$dir" ]; then
  echo "dev-remove: nothing at $dir"
  exit 0
fi
if [ ! -f "$dir/.herdr-mods-dev" ]; then
  echo "dev-remove: $dir is an installed mod, not a dev build; left alone" >&2
  exit 1
fi

rm -r "$dir"
echo "dev-remove: removed $dir"
