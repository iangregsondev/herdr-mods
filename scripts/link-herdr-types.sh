#!/bin/sh
# Links the Herdr app's type files into .herdr-types/ (gitignored).
# The app rewrites them on every start, so a link always matches the installed version.
# No app (e.g. CI): warn and exit 0 so `vp install` still succeeds.
set -eu

src="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
dest="$(cd "$(dirname "$0")/.." && pwd)/.herdr-types"

if [ ! -f "$src/herdr.d.ts" ] || [ ! -f "$src/gpui-kit.d.ts" ]; then
  echo "link-herdr-types: no Herdr app types in $src; skipping (mod type-checks will fail)" >&2
  exit 0
fi

mkdir -p "$dest"
ln -sfn "$src/herdr.d.ts" "$dest/herdr.d.ts"
ln -sfn "$src/gpui-kit.d.ts" "$dest/gpui-kit.d.ts"
echo "link-herdr-types: linked $src/{herdr,gpui-kit}.d.ts -> .herdr-types/"
