# Sourced by the hooks (`. "$hook_dir/find-vp.sh"`): puts vp on PATH when it isn't there,
# as when Claude Code was started without the shell profile (desktop app, IDE extension).
#
# A vp already on PATH wins. Otherwise the first of these folders holding an executable
# vp goes at the front of PATH, in this order (the Vite+ install layouts):
#   1. $VP_HOME/bin, only when VP_HOME is set;
#   2. $HOME/.vite-plus/bin;
#   3. ${XDG_DATA_HOME:-$HOME/.local/share}/vite-plus/bin.
#
# It only adjusts PATH: no output and no exit, so each hook reports a missing vp in its
# own words. It never sources the Vite+ env file.
if ! command -v vp >/dev/null 2>&1; then
  for find_vp_dir in ${VP_HOME:+"$VP_HOME/bin"} "$HOME/.vite-plus/bin" \
    "${XDG_DATA_HOME:-$HOME/.local/share}/vite-plus/bin"; do
    if [ -x "$find_vp_dir/vp" ]; then
      PATH="$find_vp_dir:$PATH"
      break
    fi
  done
fi
