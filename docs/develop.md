# Developing a mod

How to work on a mod and see each change live in Herdr, start a new mod, and get it ready to share. Repo layout: [structure.md](structure.md). Herdr's own rules for mods: `~/.config/herdr-app/AGENTS.md`. Agents also follow [`.claude/rules/dev-loop.md`](../.claude/rules/dev-loop.md).

## Quick start

```bash
vp run hello#dev          # 1. start: the hello panel appears on the right of Herdr
                          # 2. edit apps/hello/src/greeting.ts and save: the panel updates within a second
                          # 3. stop the watch with ctrl-c when you're done
vp run dev:remove hello   # 4. clean up: the files and the panel go
```

Swap `hello` for any mod in `apps/`.

## How it works

A mod in Herdr has two parts:

| Part      | Where                                                  | Made by                                             |
| --------- | ------------------------------------------------------ | --------------------------------------------------- |
| its files | `~/.config/herdr-app/mods/<name>/`                     | the build                                           |
| its slot  | a block in `~/.config/herdr-app/layouts/<layout>.json` | Herdr, but only the first time it ever sees the mod |

The slot is what shows the panel. Files with no slot show nothing. A slot with no files shows an empty panel.

**`vp run <name>#dev`** runs `vp pack --watch` for `apps/<name>/`, and in watch mode:

1. It builds into Herdr's folder, `~/.config/herdr-app/mods/<name>/`, instead of the repo's `mods/<name>/`.
2. After the first good build, it checks the layout Herdr is showing. If the mod has no slot there, it adds one at the edge `mod.json`'s `"place"` names (`"right"` or `"left"`), at its `"size"`.
3. On every save it rebuilds. Herdr notices the changed file and reloads the panel.

**`vp run dev:remove <name>`** deletes the folder and every slot for that mod in your layouts, so the panel goes. Run `#dev` again and it comes back.

### Safe by design

- The dev build puts a hidden `.herdr-mods-dev` marker file in its folder. Herdr ignores hidden files.
- A folder **without** the marker is a real installed mod. The watch refuses to build over it, and `dev:remove` refuses to delete it or its panel.
- Only slots for that one mod are ever added or removed, and only in your own layouts. Layouts that ship with Herdr (`main`, `terminals`, `win98`) are never edited.
- Watch mode never clears the folder, so the files Herdr writes there (`jsconfig.json`, `gpui-kit.d.ts`) stay.
- The repo's `mods/<name>/` isn't touched by the watch.

### Things that don't work (tested 2026-11-08)

- **A symlink** from Herdr's `mods/<name>` to the repo: it loads once but never reloads, and it can leave Herdr not watching that folder until Herdr restarts.
- **Editing `seen.json`** (Herdr's list of mods it has seen): Herdr keeps the list in memory, so edits do nothing while it runs. That's why the watch adds the slot itself.

## Dev build or installed copy

|           | Dev build                  | Installed copy                                              |
| --------- | -------------------------- | ----------------------------------------------------------- |
| How       | `vp run <name>#dev`        | an agent prompt (below)                                     |
| Updates   | on every save              | never: it's a one-time copy                                 |
| Remove it | `vp run dev:remove <name>` | delete the folder and the panel yourself, or ask your agent |
| For       | working on the mod         | using a finished mod                                        |

Use one or the other for a mod, never both: the watch won't build over an installed copy, and Herdr's install never overwrites, so installing over a dev build adds a renamed second copy.

To install a copy, paste this into your coding agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: <path-to-your-clone>/mods/<name>

or, once it's pushed:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/iangregsondev/herdr-mods/tree/main/mods/<name>

## Troubleshooting

| You see                                     | Why                                                              | Do                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Task "dev:remove" not found`               | You're on a branch from before this tooling                      | Run it from a checkout that has it (`git pull` on `main`)                      |
| `... is an installed mod, not a dev build`  | A real copy of the mod is installed                              | Remove that copy first (or develop under another name)                         |
| `herdr-slots: ... add <name> by hand`       | `"place"` is top, bottom or none, or the layout ships with Herdr | Add the panel yourself, or switch to your own layout (clone a shipped one)     |
| `herdr-slots: Herdr isn't running`          | `herdr-app status` didn't answer                                 | Open Herdr, then restart the watch                                             |
| Saves don't change the panel                | Herdr isn't watching the folder (often after a symlink was used) | Check `herdr-app status` for errors; if none, restart Herdr once               |
| The panel shows the old version             | The latest build broke; Herdr keeps the last good one            | `herdr-app check ~/.config/herdr-app/mods/<name>` for the exact error          |
| An empty panel after removing a mod by hand | The slot is still in your layout                                 | `vp run dev:remove <name>` removes leftover slots even when the files are gone |
| `ENOENT ... chmod` in the watch output      | The folder was deleted while the watch ran                       | Stop the watch before `dev:remove`; restart it                                 |

Set `HERDR_APP_HOME` to point all of this at another Herdr folder.

## Before you commit

The watch only writes into Herdr. Build into the repo and check:

```bash
vp run -r build       # writes mods/<name>/ (commit it with the source)
vp run -r test
vp check
vp run check:mods
```

CI fails if `mods/` doesn't match the source.

## Start a new mod

1. Copy `apps/hello/` to `apps/<name>/`.
2. Rename it in `package.json` (`"name"`), `vite.config.ts` (`modPack("<name>")`) and `assets/mod.json` (`"title"`). Set `"place"` and `"size"` in `mod.json`.
3. Run `vp install`.
4. Run `vp run <name>#dev` and build it up, test-first for pure logic (`apps/<name>/tests/`).
5. Write its `RECIPE.md` and `preview.png` (below).
6. Stop the watch, `vp run dev:remove <name>`, then the steps in "Before you commit", and commit `apps/<name>/` with `mods/<name>/`.

## Recipe and preview

Herdr's shared-mod format expects both in every mod folder. Its rules are in `~/.config/herdr-app/AGENTS.md`, section "Layouts and mods other people made". Read that section before writing: Herdr updates it.

- Keep both in `apps/<name>/assets/`. The build copies them into `mods/<name>/`.
- **`RECIPE.md`** is a brief another agent could rebuild the mod from, starting with an empty folder. Its sections, in order: `# Name` with one paragraph and `![Name](preview.png)`, then **What you see**, **How it behaves**, **Built from**, **Watch out** and **Done when**. Write it from the real files, exact over vague. `apps/hello/assets/RECIPE.md` shows the shape.
- **`preview.png`** is a screenshot of the mod. Take one with `herdr-app shot` while the dev build runs, then crop it to the mod alone. This repo is public, so nothing else from your window may show: other panels, repo or branch names, paths, terminal text.
- Update the recipe in the same change as any behaviour change.

To list it on herdr.dev/mods, the repo needs the `herdr-mod` topic (already set).
