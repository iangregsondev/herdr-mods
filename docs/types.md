# Herdr types

Mods import `herdr`, `gpui-kit` and `gpui-base`. No npm package provides their types (checked 2026-11-08: npm, the herdrdev GitHub org, longbridge/gpui-kit). The Herdr app writes them itself, on every start:

- `~/.config/herdr-app/herdr.d.ts`: the `herdr` module (spaces, agents, `exec`, `run`, …)
- `~/.config/herdr-app/gpui-kit.d.ts`: `gpui-kit`, `gpui-base` and the other built-ins

Their header says not to commit them: "A committed copy could only ever be the stale one."

## How this repo uses them

- `scripts/link-herdr-types.sh` symlinks both files into `.herdr-types/` (gitignored). A symlink always matches the installed app.
- It runs on every `vp install` (the root `prepare` script), or by hand with `vp run types`. `HERDR_APP_HOME` overrides the source folder.
- With no Herdr app (CI), it warns and exits 0. Mod type-checks then fail with "Cannot find module 'gpui-kit'".
- `herdr-env.d.ts` loads `gpui-kit.d.ts` with a triple-slash reference, because it declares ambient modules. `tsconfig.json` maps `herdr` to `herdr.d.ts` through `paths`, because that file is a plain module.
- `tsconfig.json` copies the app's own `jsconfig.json`: ES2022, no DOM or Node libs, `strictNullChecks` off (a View sets its state in `init`).
- `herdr-app check` writes `gpui-kit.d.ts` and `jsconfig.json` into each `mods/<name>/`. Both are gitignored.

## Known gaps

- `theme()` is typed `Record<string, string>`, but style methods want `` `#${string}` ``. Cast with `theme() as Record<string, `#${string}`>`.
- If herdrdev ever publishes the types to npm, replace all of this with `vp add -D <package>`.
