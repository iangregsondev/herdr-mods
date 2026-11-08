# Developing a mod

How to work on a mod with live reload, start a new one, and get it ready to share. Repo layout: [structure.md](structure.md). Herdr's own rules for mods: `~/.config/herdr-app/AGENTS.md`.

## The live loop

```bash
vp run <name>#dev
```

This runs `vp pack --watch` for `apps/<name>/`. In watch mode the build goes straight into the Herdr app, at `~/.config/herdr-app/mods/<name>/`, not into the repo's `mods/<name>/`. Herdr reloads a mod whenever a file in that folder is saved, so each `.ts` save shows in the window within a second.

- **First run:** Herdr sees a new folder and docks the mod where its `mod.json` says (`"place"`). After that, your layout decides where it is.
- **Errors:** a build that breaks keeps the last good version running. Herdr lists load errors in `herdr-app status`. Run `herdr-app check ~/.config/herdr-app/mods/<name>` for the exact error.
- **Another app home:** set `HERDR_APP_HOME` to build into a different Herdr folder.

### Safe by design

- The dev build writes a hidden `.herdr-mods-dev` marker into its folder. Herdr ignores hidden files.
- If `~/.config/herdr-app/mods/<name>/` already exists **without** the marker, it is a real installed mod. The watch then stops with an error and never overwrites it. Rename or remove that mod in Herdr first.
- Watch mode never cleans the folder, so files Herdr writes there (`jsconfig.json`, `gpui-kit.d.ts`) stay.

### Why not a symlink?

Tested 2026-11-08: a symlink from `~/.config/herdr-app/mods/<name>` to the repo's `mods/<name>/` loads once but never hot-reloads. Herdr only watches real folders in its own `mods/`. So the watch writes there directly.

### When you're done

```bash
vp run dev:remove <name>
```

It removes the dev build from Herdr, but only a folder with the marker. A real install is left alone.

The repo's `mods/<name>/` isn't touched by the watch. Before committing, run `vp run -r build` and commit the updated `mods/`. CI fails if `mods/` doesn't match the source.

## Install a copy instead

To install a mod as a user would (a snapshot, with no live reload), paste this into your coding agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: <path-to-your-clone>/mods/<name>

or, once it's pushed:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/iangregsondev/herdr-mods/tree/main/mods/<name>

Use one or the other for a mod, not both. Herdr's install never overwrites, so installing over a dev build adds a second, renamed copy, and the dev watch refuses to write over an installed copy.

## Start a new mod

1. Copy `apps/hello/` to `apps/<name>/`.
2. Rename it in `package.json` (`"name"`), `vite.config.ts` (`modPack("<name>")`) and `assets/mod.json` (`"title"`).
3. Run `vp install`.
4. Run `vp run <name>#dev` and build it up, test-first for pure logic (`apps/<name>/tests/`).
5. Write its `RECIPE.md` and `preview.png` (below).
6. `vp run -r build`, `vp run check:mods`, and commit `apps/<name>/` with `mods/<name>/`.

## Recipe and preview

Herdr's shared-mod format expects both in every mod folder. Its rules are in `~/.config/herdr-app/AGENTS.md`, section "Layouts and mods other people made". Read that section before writing: Herdr updates it.

- Keep both in `apps/<name>/assets/`. The build copies them into `mods/<name>/`.
- **`RECIPE.md`** is a brief another agent could rebuild the mod from, starting with an empty folder. Its sections, in order: `# Name` with one paragraph and `![Name](preview.png)`, then **What you see**, **How it behaves**, **Built from**, **Watch out** and **Done when**. Write it from the real files, exact over vague. `apps/hello/assets/RECIPE.md` shows the shape.
- **`preview.png`** is a screenshot of the mod. Take one with `herdr-app shot`, then crop it to the mod alone. This repo is public, so nothing else from your window may show: other panels, repo or branch names, paths, terminal text.
- Update the recipe in the same change as any behaviour change.

To list it on herdr.dev/mods, the repo needs the `herdr-mod` topic (already set).
