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
  worktrunk-mailbox/      how mods reach the worktrunk panel: its mailbox and its layout block, plus the JSON readers and Files service the mods share
mods/iangregsondev-<name>/  BUILD OUTPUT, committed: the folder Herdr users install
layouts/<name>.json       hand-written layouts (the window; they reference mods)
mod-pack.ts               shared vp pack settings for every mod: the namespace, the out folder (watch mode builds into Herdr, or stages in node_modules/.herdr-dev/ and syncs to a remote Herdr host)
mod-env.d.ts              declares __MOD_ID__ and __NAMESPACE__, the constants the build gives each mod
herdr-dev.example.json    template for herdr-dev.json (git-ignored): the dev target, local or a remote Herdr host
.config/wt.toml           worktrunk hooks: a new worktree gets the main checkout's herdr-dev.json
scripts/changeset-check.ts  vp run check:changesets: CI fails a PR that changes a mod (or packages/) without a changeset for it
scripts/check-mods.ts     vp run check:mods: herdr-app check on every built mod, on the dev target's Herdr host
scripts/copy-dev-config.sh  copies herdr-dev.json into a new worktree (run by .config/wt.toml)
scripts/dev-config.ts     reads the dev target from herdr-dev.json (or HERDR_DEV_CONFIG)
scripts/dev-remove.ts     removes a mod's dev build and its panel from the dev target's Herdr host
scripts/git.ts            Git: the Effect service for git in a repo folder (files changed since a base ref, tags on origin)
scripts/herdr-host.ts     HerdrHost: the Effect service for all Herdr home IO and herdr-app calls (local, or remote over SSH)
scripts/herdr.ts          vp run herdr <args…>: herdr-app on the dev target's Herdr host; `shot <file> [--crop x,y,w,h]` copies a (cropped) screenshot back
scripts/herdr-types.ts    vp run types: puts Herdr's type files into .herdr-types/ from the dev target's Herdr host (docs/types.md)
scripts/herdr-slots.ts    adds and removes a mod's slot in Herdr's layout files
scripts/herdr-sync.ts     builds my layout from Herdr's default (vp run herdr:sync; docs/develop.md)
scripts/require-vp.sh     preinstall guard: installs must go through vp
scripts/test-support.ts   test helpers for scripts and hooks: temp folders, fake commands, a fake Herdr host, run sh
scripts/*.test.ts         tests of the root scripts, mod-pack.ts, .claude/hooks/ and mods' shell scripts
scripts/tsconfig.json     Node types for the root scripts (docs/types.md)
scripts/oxlint-functional.ts  lint rules: functional style in src/ (not main.ts); explained casts in src/, scripts/, mod-pack.ts
scripts/audit.ts          config rot audit (vp run audit:config; pure checks in audit-config.ts)
herdr-env.d.ts            loads the Herdr app's types (see docs/types.md)
```

- **A mod is an app.** It ships and nothing imports it. Shared code that mods import goes in `packages/`.
- **Namespace:** a mod is `<name>` in the repo (`apps/<name>/`, its package, `vp run <name>#dev`, `vp run dev:remove <name>`) and `iangregsondev-<name>` once built: its mod id ([ADR 0002](adr/0002-namespace-mod-ids.md)). `NAMESPACE` in `mod-pack.ts` holds the prefix. The mod reads its id as `__MOD_ID__`; use it for shared-state keys, settings files and layout references, never a hand-typed name.
- **Build:** `vp run -r build` runs `vp pack` in each app. The output is `mods/iangregsondev-<name>/main.js`: ESM, ES2022, not minified (installers read every file). `herdr`, `gpui-kit` and the other built-ins stay external, and everything else gets bundled.
- **Commit `mods/`.** Installs only copy files (with no build and no `npm install`), and hmod matches installed mods to this repo by file hash.
- **Dev:** `vp run <name>#dev` watches and builds a dev build into the Herdr app instead, on the dev target from `herdr-dev.json` (no file means `local`). `local`: into `~/.config/herdr-app/mods/iangregsondev-<name>/`. `remote`: into `node_modules/.herdr-dev/iangregsondev-<name>/`, then rsync over SSH into the Herdr host's `mods/iangregsondev-<name>/`. Herdr reloads on every save. It never touches the repo's `mods/`. `vp run herdr <args…>` runs `herdr-app` on the same Herdr host. Details: [develop.md](develop.md).
- **The runtime is the Herdr app's embedded JS** (gpui-kit). It is not Node or Bun: no Node APIs and no DOM. `setTimeout` exists but throws: use `cx.timer`.
- **New mod:** copy `apps/hello/`, rename it in `package.json`, `vite.config.ts` and `assets/mod.json`, then `vp install`. Full steps: [develop.md](develop.md).
