---
paths:
  - "apps/**"
  - "mod-pack.ts"
  - "scripts/**"
---

# Running a mod in Herdr (the dev loop)

The human guide is `docs/develop.md`. These are the steps an agent follows to see a mod working.

## Steps

1. Start the watch **in the background**: `vp run <name>#dev`. Wait for `✔ Rebuilt` and a `herdr-slots:` line in its output.
   - `added <name> to "<layout>"` or `already has a slot`: the panel is showing.
   - `... add <name> by hand`: tell the person and stop; don't edit layouts yourself.
   - `... is an installed mod, not a dev build`: a real copy is installed. Tell the person; never delete or rename it.
2. Edit `apps/<name>/src/`. Each save rebuilds into `~/.config/herdr-app/mods/<name>/` and Herdr reloads.
3. Prove it: `herdr-app status` (errors must be `[]`), `herdr-app check ~/.config/herdr-app/mods/<name>`, and `herdr-app shot <file>` cropped to the panel, then read the image. A screenshot is the evidence a change works.
4. When done: stop the watch (TaskStop) **before** `vp run dev:remove <name>`. Removing while it runs makes it error and rewrite the folder.
5. Before committing: `vp run -r build`, `vp run -r test`, `vp check`, `vp run check:mods`, and commit `mods/` with the source.

## Never

- Never symlink a mod into Herdr: it doesn't reload, and can stop Herdr watching the folder until it restarts.
- Never edit `seen.json`: Herdr keeps it in memory.
- Never edit `~/.config/herdr-app/layouts/` by hand to add or remove a dev panel; `#dev` and `dev:remove` do it (`scripts/herdr-slots.ts`). If the person asks for a manual layout change, back the file up first and show the diff.
- Never touch a mod folder without the `.herdr-mods-dev` marker: it's a real install.
- Never put window screenshots in the repo uncropped: it's public, and the window shows other repos, branches and paths.
- Never `vp run` a task that acts on the Herdr folder with caching on: cached tasks replay old output without running (`run.tasks` in `vite.config.ts` sets `cache: false`).
