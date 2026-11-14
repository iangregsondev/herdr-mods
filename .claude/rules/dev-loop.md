---
paths:
  - "apps/**"
  - "mod-pack.ts"
  - "scripts/**"
---

# Running a mod in Herdr (the dev loop)

The human guide is `docs/develop.md`; its "Remote Herdr host" section covers setup. These are the steps an agent follows to see a mod working.

The loop acts on the **dev target**: `local` (the Herdr app on this machine) or `remote` (a **Herdr host** reached over SSH), set by `herdr-dev.json` at the repo root. Every command below works the same for both. Run `herdr-app` through `vp run herdr <args…>`, which runs it on the dev target's Herdr host.

## Steps

1. Start the watch **in the background**: `vp run <name>#dev`.
   - Its first line names the dev target: `target: local (no herdr-dev.json)`, `target: local (herdr-dev.json)` or `target: remote <user>@<host>:<port> (herdr-dev.json)`. If it isn't the target the person expects, stop the watch and tell them.
   - Wait for `✔ Rebuilt` and a `herdr-slots:` line. A remote watch prints `mod-pack: synced iangregsondev-<name> to …` before it.
   - `added iangregsondev-<name> to "<layout>"` or `already has a slot`: the panel is in the configured layout (`Workbench` unless `herdr-dev.json` names another). The loop edits only that layout, whichever one Herdr shows; if another is showing, switch with `vp run herdr do layout.switch --name <layout>`.
   - `there is no layout "<layout>" yet`: run `vp run herdr:sync`, then save again.
   - `... add iangregsondev-<name> by hand`: tell the person and stop; layout edits are theirs.
   - `... is an installed mod, not a dev build`: a real copy is installed. Tell the person and leave it as it is.
   - `mod-pack: Herdr host unreachable: …; the next build tries again`: the host is asleep or offline. Tell the person; the watch keeps running and the next save retries.
2. Edit `apps/<name>/src/`. Each save rebuilds the **dev build** and Herdr reloads it. You always type the short name; `mod-pack.ts` adds the namespace to every folder. Local: the build lands in `<Herdr home>/mods/iangregsondev-<name>/`. Remote: it lands in the staging folder `node_modules/.herdr-dev/iangregsondev-<name>/`, then rsync copies it to the Herdr host's `mods/iangregsondev-<name>/`.
3. Prove it, every time:
   - `vp run herdr status`: `errors` must be `[]`.
   - `vp run herdr shot .scratch/<file>.png --crop x,y,w,h`, then read the image. Shoot once without `--crop` to find the panel's pixel box, then again cropped to it. The screenshot is the evidence a change works.
   - On a build error: `vp run herdr check <folder>`, with the dev build's absolute path on the Herdr host. This machine's shell expands a `~`, so it would name this machine's home.
4. When done: stop the watch (TaskStop) **before** `vp run dev:remove <name>`. Removing while it runs makes it error and rewrite the folder. It leaves the layout `herdr:sync` built (the configured one, `Workbench` by default) as it is, so no sync is needed afterwards to restore that layout; `docs/develop.md` ("Layouts", "Your layout") says when one is. Herdr's `main` is never edited.
5. Before committing: `vp run -r build`, `vp run verify` (check, every test, config audit), `vp run check:mods`, and commit `mods/` with the source.

## Never

- Never symlink a mod into Herdr: it doesn't reload, and can stop Herdr watching the folder until it restarts.
- Never edit `seen.json`: Herdr keeps it in memory.
- Never edit the Herdr home's `layouts/` by hand to add or remove a dev panel; `#dev` and `dev:remove` do it (`scripts/herdr-slots.ts`). If the person asks for a manual layout change, back the file up first and show the diff.
- Never touch a mod folder without the `.herdr-mods-dev` marker: it's an **installed mod**.
- Never put window screenshots in the repo uncropped: it's public, and the window shows other repos, branches and paths.
- Never write the Herdr host's name or user into a commit, issue or PR. `herdr-dev.json` holds them and is git-ignored.
- Never `vp run` a task that acts on the Herdr folder with caching on: cached tasks replay old output without running (`run.tasks` in `vite.config.ts` sets `cache: false`).
