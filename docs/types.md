# Herdr types

Mods import `herdr`, `gpui-kit` and `gpui-base`. No npm package provides their types (checked 2026-11-08: npm, the herdrdev GitHub org, longbridge/gpui-kit). The Herdr app writes them itself, on every start:

- `~/.config/herdr-app/herdr.d.ts`: the `herdr` module (spaces, agents, `exec`, `run`, …)
- `~/.config/herdr-app/gpui-kit.d.ts`: `gpui-kit`, `gpui-base` and the other built-ins

Their header says not to commit them: "A committed copy could only ever be the stale one."

## How this repo uses them

- `scripts/herdr-types.ts` puts both files into `.herdr-types/` (gitignored), from the dev target's Herdr host (`herdr-dev.json`; see `scripts/dev-config.ts`):
  - `local`: symlinks them from the Herdr home. A symlink always matches the installed app. `HERDR_APP_HOME` overrides the source folder.
  - `remote`: copies them from the Herdr host's home over SSH as real files, replacing any old links (a link to a path on the other machine would dangle here). Run it again after updating Herdr on the host.
- It runs on every `vp install` (the root `prepare` script), at the start of every `vp run <name>#dev` watch, or by hand with `vp run types`.
- With no type files (CI, no Herdr app) or no reachable Herdr host, it warns and exits 0, so `vp install` still succeeds. Mod type-checks then fail with "Cannot find module 'gpui-kit'", which is why CI (`CI` set) turns off both the type-check and the type-aware lint rules in `vite.config.ts`: without the types those rules see `any` and warn. A broken `herdr-dev.json` stops it with exit 1, naming the field.
- `herdr-env.d.ts` loads `gpui-kit.d.ts` with a triple-slash reference, because it declares ambient modules. `tsconfig.json` maps `herdr` to `herdr.d.ts` through `paths`, because that file is a plain module.
- `tsconfig.json` is based on the app's own `jsconfig.json`: ES2022, no DOM or Node libs. One difference: the app turns `strictNullChecks` off because a View sets its state in `init`, not a constructor. This repo keeps `strictNullChecks` on, because Effect's types (`Option`, the error channel) depend on it, and turns only `strictPropertyInitialization` off for the same `init` reason.
- `scripts/tsconfig.json` extends it for the root scripts and their tests, which run on Node, not in the app: it adds Node's types (`@types/node`). Without it, a script type-checked on its own (as the pre-commit hook does with staged files) can't find `node:fs` or `process`.
- `herdr-app check` writes `gpui-kit.d.ts` and `jsconfig.json` into each `mods/iangregsondev-<name>/`. Both are gitignored.

## Known gaps

- `theme()` is typed `Record<string, string>`, but style methods want `` `#${string}` ``. Cast with `theme() as Record<string, `#${string}`>`.
- If herdrdev ever publishes the types to npm, replace all of this with `vp add -D <package>`.
