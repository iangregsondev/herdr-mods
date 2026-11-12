# Repo structure

This repo holds mods and layouts for the **Herdr app**, the desktop GUI with its home in `~/.config/herdr-app`. It is not for the older Herdr TUI, whose plugins use `herdr-plugin.toml`.

```
apps/<name>/              SOURCE of one mod (you edit this)
  src/main.ts             entry: default-exports a class extending View
  src/*.ts                more modules; keep pure logic free of herdr/gpui imports
  tests/*.test.ts         vp test, for pure logic only
  assets/                 copied as-is into the build:
    mod.json              where the mod first appears
    RECIPE.md, preview.png  for sharing (herdr.dev/mods); see docs/develop.md
    *.svg                 the mod's own icons
  vite.config.ts          pack: modPack("<name>")
packages/<name>/          shared TS libs, bundled into each mod that imports them
mods/<name>/              BUILD OUTPUT, committed: the folder Herdr users install
layouts/<name>.json       hand-written layouts (the window; they reference mods)
mod-pack.ts               shared vp pack settings for every mod (watch mode builds into Herdr)
scripts/dev-remove.ts     removes a mod's dev build and its panel from Herdr
scripts/herdr-host.ts     HerdrHost: the Effect service for all Herdr home IO and herdr-app calls (local, or remote over SSH)
scripts/herdr.ts          vp run herdr <args…>: herdr-app on the dev target's Herdr host
scripts/herdr-slots.ts    adds and removes a mod's slot in Herdr's layout files
scripts/require-vp.sh     preinstall guard: installs must go through vp
scripts/test-support.ts   test helpers for scripts and hooks: temp folders, fake commands, a fake Herdr host, run sh
scripts/*.test.ts         tests of the root scripts, mod-pack.ts and .claude/hooks/
scripts/tsconfig.json     Node types for the root scripts (docs/types.md)
scripts/oxlint-functional.ts  lint rules: functional style in src/ (not main.ts); explained casts in src/, scripts/, mod-pack.ts
scripts/audit.ts          config rot audit (vp run audit:config; pure checks in audit-config.ts)
herdr-env.d.ts            loads the Herdr app's types (see docs/types.md)
```

- **A mod is an app.** It ships and nothing imports it. Shared code that mods import goes in `packages/`.
- **Build:** `vp run -r build` runs `vp pack` in each app. The output is `mods/<name>/main.js`: ESM, ES2022, not minified (installers read every file). `herdr`, `gpui-kit` and the other built-ins stay external, and everything else gets bundled.
- **Commit `mods/`.** Installs only copy files (with no build and no `npm install`), and hmod matches installed mods to this repo by file hash.
- **Dev:** `vp run <name>#dev` watches and builds into `~/.config/herdr-app/mods/<name>/` instead, so Herdr reloads on every save. It never touches the repo's `mods/`. Details: [develop.md](develop.md).
- **The runtime is the Herdr app's embedded JS** (gpui-kit). It is not Node or Bun: no Node APIs and no DOM. `setTimeout` exists but throws: use `cx.timer`.
- **New mod:** copy `apps/hello/`, rename it in `package.json`, `vite.config.ts` and `assets/mod.json`, then `vp install`. Full steps: [develop.md](develop.md).
