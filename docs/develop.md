# Developing a mod

How to work on a mod and see each change live in Herdr, start a new mod, and get it ready to share. Repo layout: [structure.md](structure.md). Herdr's own rules for mods: `AGENTS.md` in the Herdr home (`~/.config/herdr-app/AGENTS.md` on the machine running Herdr). Agents also follow [`.claude/rules/dev-loop.md`](../.claude/rules/dev-loop.md).

## Quick start

```bash
vp run worktrunk#dev          # 1. start: the iangregsondev-worktrunk panel appears on the right of Herdr
                              # 2. edit apps/worktrunk/src/view.ts and save: the panel updates within a second or two
                              # 3. stop the watch with ctrl-c when you're done
vp run dev:remove worktrunk   # 4. clean up: the files and the panel go
```

Swap `worktrunk` for any mod in `apps/`. You always type the short mod name; the build and `dev:remove` add the `iangregsondev-` namespace, so Herdr knows the mod as `iangregsondev-<name>` ([ADR 0002](adr/0002-namespace-mod-ids.md)). In code, a mod reads its full id as the constant `__MOD_ID__` (declared in `mod-env.d.ts`): use it for shared-state keys, settings files and layout references.

This works as it is when Herdr runs on the same machine as the repo. If Herdr runs on another machine, set that up first: [Remote Herdr host](#remote-herdr-host).

## Dev target: where dev builds go

The **dev target** says which Herdr app the dev loop works with:

- **`local`** (the default): the Herdr app on this machine.
- **`remote`**: the Herdr app on another machine, the **Herdr host**, reached over SSH. Use it when the repo and your coding agents live on one machine (say, a Linux box) and Herdr runs on another (say, a laptop).

Every dev-loop command follows the dev target: `#dev`, `dev:remove`, `vp run herdr`, `check:mods` and `vp run types`. So the same commands work in both modes.

When a watch starts, its first line names the dev target, so a missing or wrong config is never silent:

```text
target: local (no herdr-dev.json)
target: remote <user>@<host>:22 (herdr-dev.json)
```

## How it works

A mod in Herdr has two parts. Both live in the Herdr home (`~/.config/herdr-app` unless you change it):

| Part      | Where                                           | Made by                                             |
| --------- | ----------------------------------------------- | --------------------------------------------------- |
| its files | `<Herdr home>/mods/iangregsondev-<name>/`       | the build                                           |
| its slot  | a block in `<Herdr home>/layouts/<layout>.json` | Herdr, but only the first time it ever sees the mod |

The slot is what shows the panel. Files with no slot show nothing. A slot with no files shows an empty panel.

**`vp run <name>#dev`** runs `vp pack --watch` for `apps/<name>/`, and in watch mode:

1. It prints the dev target and refreshes Herdr's type files from it (see [types.md](types.md)).
2. It builds the **dev build**, never into the repo's `mods/iangregsondev-<name>/`:
   - `local`: straight into the Herdr home's `mods/iangregsondev-<name>/`.
   - `remote`: into a staging folder on this machine, `node_modules/.herdr-dev/iangregsondev-<name>/` (git-ignored, kept between runs). After every good build, rsync copies it into the Herdr host's `mods/iangregsondev-<name>/`. A failed build is never copied, so Herdr never loads half a mod.
3. After the first good build (remote: the first good copy), it checks the layout Herdr is showing. If the mod has no slot there, it adds one at the edge `mod.json`'s `"place"` names (`"right"` or `"left"`), at its `"size"`.
4. On every save it rebuilds. Herdr notices the changed files and reloads the panel.

**`vp run dev:remove <name>`** deletes the dev build's folder and every slot for that mod in your layouts, on the dev target, so the panel goes. Run `#dev` again and it comes back. The one layout it leaves alone is the one `herdr:sync` builds (see "Your layout" below), and it says so.

## See what Herdr sees: `vp run herdr`

`vp run herdr <args…>` runs `herdr-app <args…>` on the dev target's Herdr host and prints what it says, with its exit code. Use it in place of calling `herdr-app` yourself:

```bash
vp run herdr status                              # errors: [] means every mod loaded
vp run herdr check <mod folder on the Herdr host> # the exact error for one mod
vp run herdr shot shot.png                        # the whole window, saved here
vp run herdr shot panel.png --crop 3800,120,1300,900  # only that box, in pixels
```

- `shot <file>` saves the screenshot to `<file>` on this machine. It shoots into a temp folder on the Herdr host, copies the image back and removes the temp folder.
- `--crop x,y,w,h` crops on the Herdr host with `sips` (macOS) before the copy, so nothing else is needed here. Take a full shot first to find the panel's box. The window is large (5120×2718 on a Retina screen), so crop to the panel.
- For `check`, give the folder as an absolute path on the Herdr host. Your shell expands `~` to this machine's home before `vp` sees it.

### Safe by design

- The dev build puts a hidden `.herdr-mods-dev` marker file in its folder. Herdr ignores hidden files.
- A folder **without** the marker is an **installed mod**. The watch refuses to build over it, and `dev:remove` refuses to delete it or its panel.
- Only slots for that one mod are ever added or removed, and only in your own layouts. Layouts that ship with Herdr (`main`, `terminals`, `win98`) are never edited.
- Watch mode never clears the folder, so the files Herdr writes there (`jsconfig.json`, `gpui-kit.d.ts`) stay. The remote copy never deletes files on the Herdr host either (no `--delete`).
- The repo's `mods/iangregsondev-<name>/` isn't touched by the watch.
- `dev:remove` on an unreachable Herdr host stops with `Herdr host unreachable` before changing anything, so nothing is half removed.

### Things that don't work (tested 2026-11-08)

- **A symlink** from Herdr's `mods/iangregsondev-<name>` to the repo: it loads once but never reloads, and it can leave Herdr not watching that folder until Herdr restarts.
- **Editing `seen.json`** (Herdr's list of mods it has seen): Herdr keeps the list in memory, so edits do nothing while it runs. That's why the watch adds the slot itself.

## Dev build or installed mod

|           | Dev build                  | Installed mod                                               |
| --------- | -------------------------- | ----------------------------------------------------------- |
| How       | `vp run <name>#dev`        | an agent prompt (below)                                     |
| Updates   | on every save              | never: it's a one-time copy                                 |
| Remove it | `vp run dev:remove <name>` | delete the folder and the panel yourself, or ask your agent |
| For       | working on the mod         | using a finished mod                                        |

Use one or the other for a mod, never both: the watch won't build over an installed mod, and Herdr's install never overwrites, so installing over a dev build adds a renamed second copy.

To install a copy, paste this into your coding agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: <path-to-your-clone>/mods/iangregsondev-<name>

or, once it's pushed:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/iangregsondev/herdr-mods/tree/main/mods/iangregsondev-<name>

## Your layout: `herdr:sync`

`vp run herdr:sync` builds your own layout, `workbench`, from Herdr's current default layout (`main`) plus this repo's additions: the worktrunk panel on the right, its toggle button at the end of the tab bar, and, when the `menus` mod is installed, Herdr's tab bar and sidebar swapped for the `menus` mod's copies of them, whose "+" and space menus carry worktrunk items. It writes `~/.config/herdr-app/layouts/workbench.json` and a record of the layout and the Herdr version it built from, `~/.config/herdr-app/iangregsondev-sync.json`. A file that already holds what it would write is left untouched, so Herdr reloads nothing.

- **It's safe to run any time.** It reads Herdr's files and never edits them, and keeps none of Herdr's code in this repo. Herdr's `main` stays as it is, so Herdr's usual layout switch (`layout.switch`, default `ctrl-shift-l`) moves between the two, for comparing Herdr's updates. To switch from a shell: `herdr-app do layout.switch --name workbench`.
- **It retires the layout's old name.** The layout used to be called `iangregsondev`. When the record says an earlier sync built a layout under another name, the sync removes that layout, and if Herdr was showing it, switches Herdr to `workbench` first. That is the only time it switches your layout. A layout the record doesn't name, such as one you made by hand, is never removed. If the switch fails, the old layout is kept, the sync exits 1, and the next run tries again.
- **It works on this machine's Herdr only.** Unlike the dev loop, it doesn't follow the dev target yet: with a `remote` target, run it on the Herdr host itself.
- **The worktrunk mod must be installed** (or running as a dev build) for the panel and toggle to show in the layout.
- **`vp run dev:remove` leaves this layout alone.** Its blocks belong to the sync, so they stay when a dev build goes: after `dev:remove worktrunk` the layout still names the panel and toggle, and they come back with the next `vp run worktrunk#dev`.
- **Worktrunk items in Herdr's menus need the repo and the sync.** Herdr gives mods no way to add menu items, so the `menus` mod plays Herdr's own `tabs`, `spaces`, `new-menu` and `menu` from copies of Herdr's installed code, patched at run time ([ADR 0003](adr/0003-extend-herdr-menus.md)). Only a layout that names it uses it, and `herdr:sync` writes that layout. The sync swaps the tab bar and sidebar only when `menus` is installed (or running as a dev build), and says so when it isn't; the items also need the worktrunk mod. After `dev:remove menus` the layout still names it, so the window has no tab bar or sidebar until `vp run menus#dev` runs again or a sync with the mod gone puts Herdr's own back.
- **The layout is generated.** Every run rebuilds it from `main`, so hand edits to `workbench.json` are lost. Change the additions in `scripts/herdr-sync.ts` (`LAYOUT_EDITS`) instead.

**When to re-run it:**

- after every Herdr update, so your layout picks up Herdr's changes to `main`. The worktrunk panel shows a toast, "Herdr updated: run herdr:sync", once per new version, when the installed Herdr differs from the recorded one;
- after pulling changes to `scripts/herdr-sync.ts`;
- after installing or removing the `menus` mod.

**When a menu patch point no longer fits** Herdr's code (after a Herdr update), the `menus` mod uses Herdr's own unpatched copy and shows a toast naming the patch point, for example `tabs: "+" button opens new-menu (not found)`. The menus then work as Herdr's, without worktrunk items. Update that patch in `apps/menus/src/wraps.ts` (test first, against the stand-ins in `apps/menus/tests/fixtures/`).

**When it fails**, it writes nothing and names the patch point that no longer fits, for example `tab-bar toggle: expected exactly one block showing the "tabs" mod, found 0`. That means Herdr's default layout changed shape: update that edit in `scripts/herdr-sync.ts` (test first), then run it again. Your existing layout keeps working meanwhile. It also stops, writing nothing, when it can't read `main.json`, when `herdr-app --version` gives no version, or when Herdr itself ships a layout named `workbench`.

## Troubleshooting

| You see                                                             | Why                                                                        | Do                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Task "dev:remove" not found`                                       | You're on a branch from before this tooling                                | Run it from a checkout that has it (`git pull` on `main`)                                                                        |
| `... is an installed mod, not a dev build`                          | A real copy of the mod is installed                                        | Remove that copy first (or develop under another name)                                                                           |
| `herdr-slots: ... add iangregsondev-<name> by hand`                 | `"place"` is top, bottom or none, or the layout ships with Herdr           | Add the panel yourself, or switch to your own layout (clone a shipped one)                                                       |
| `herdr-slots: Herdr isn't running`                                  | `herdr-app status` didn't answer on the Herdr host                         | Open Herdr, then restart the watch                                                                                               |
| `herdr-slots: herdr-app not found on PATH`                          | The Herdr app isn't installed, or its CLI isn't on your `PATH`             | Install the Herdr app, then restart the watch                                                                                    |
| `dev-remove: could not read these layouts`                          | A layout file isn't valid JSON; it was left as it is                       | Fix or delete that file, then run `dev:remove` again for its panel                                                               |
| Saves don't change the panel                                        | Herdr isn't watching the folder (often after a symlink was used)           | Check `vp run herdr status` for errors; if none, restart Herdr once                                                              |
| The panel shows the old version                                     | The latest build broke; Herdr keeps the last good one                      | `vp run herdr check <mod folder>` for the exact error                                                                            |
| An empty panel after removing a mod by hand                         | The slot is still in your layout                                           | `vp run dev:remove <name>` removes leftover slots even when the files are gone                                                   |
| `ENOENT ... chmod` in the watch output                              | The folder was deleted while the watch ran                                 | Stop the watch before `dev:remove`; restart it                                                                                   |
| `target: local` when you meant remote                               | No `herdr-dev.json` in this checkout                                       | Copy it from the main checkout (see [Remote Herdr host](#remote-herdr-host))                                                     |
| `mod-pack: herdr-dev.json: <field>: ...`                            | The config has a bad or misspelt field                                     | Fix that field; compare with `herdr-dev.example.json`                                                                            |
| `vp install` fails with `herdr-types: herdr-dev.json: <field>: ...` | `vp install` runs the types step, which stops at a broken `herdr-dev.json` | Fix that field (compare with `herdr-dev.example.json`), then `vp install` again. To build locally meanwhile, move the file aside |
| `Herdr host unreachable: <host>`                                    | SSH couldn't connect in 5 seconds (host asleep, offline, no key)           | Wake the host, check `ssh <user>@<host>` works with no prompt, save again                                                        |

In `local` mode, set `HERDR_APP_HOME` to point all of this at another Herdr folder. In `remote` mode, `remote.herdrHome` in `herdr-dev.json` does that instead.

## Remote Herdr host

Use this when Herdr runs on a different machine from the repo. The dev loop still builds here, then copies each build to the Herdr host over SSH. Why this design: [ADR 0001](adr/0001-build-here-sync-to-herdr-host.md).

### What the Herdr host needs

- **sshd**, with key login from this machine. Set up the SSH key yourself: the repo holds no password or key, and SSH runs in batch mode, so it never prompts. Test with `ssh -p <port> <user>@<host> true`: it must succeed without asking anything.
- **rsync**. The one macOS ships is enough.
- **The Herdr app**, with its CLI at `~/.local/bin/herdr-app` (or set `remote.herdrApp`). It is called by its full path, because a non-login SSH session doesn't have it on `PATH`.

Nothing from the repo runs on the Herdr host.

### Set it up

1. Copy the example and fill in your host and user:

   ```bash
   cp herdr-dev.example.json herdr-dev.json
   ```

   ```json
   {
     "target": "remote",
     "remote": {
       "host": "herdr-host.example",
       "user": "your-user",
       "port": 22,
       "herdrHome": "~/.config/herdr-app",
       "herdrApp": "~/.local/bin/herdr-app"
     }
   }
   ```

   `host` (a name or an IP) and `user` are required. `port`, `herdrHome` and `herdrApp` can be left out; the values above are their defaults. A misspelt or unknown field is an error naming that field, never a quiet fall back to `local`. `"target": "local"`, or no file at all, means `local`.

2. Run `vp run types`. It copies Herdr's type files from the Herdr host into `.herdr-types/`, so `vp check` passes here. `vp install` and every `#dev` watch do the same; run it again after updating Herdr on the host. A host that can't be reached only warns, but a broken `herdr-dev.json` makes `vp install` fail, naming the field to fix.
3. Run `vp run worktrunk#dev`. The first line should read `target: remote <user>@<host>:<port> (herdr-dev.json)`.

`herdr-dev.json` is git-ignored: it names a real host and user, and this repo is public. Only `herdr-dev.example.json`, with placeholder values, is committed.

**Worktrees.** A new worktree made with `wt` gets `herdr-dev.json` copied from the main checkout (the `pre-start` hook in `.config/wt.toml`), so it targets the same Herdr host. With no file in the main checkout, nothing is copied. Made with plain `git worktree`, copy it yourself.

**Another config file.** Set `HERDR_DEV_CONFIG` to a path to use that file instead of `herdr-dev.json`. A missing file there is an error, not `local`.

### What changes in remote mode

- Builds go to the staging folder `node_modules/.herdr-dev/iangregsondev-<name>/` first, and are copied with `rsync -rlt` after each good build. A copy takes a second or two.
- If the Herdr host can't be reached, the watch prints the error and keeps running; the next save tries again. SSH gives up after 5 seconds, so an asleep host never hangs the watch.
- `vp run check:mods` copies the repo's `mods/` to a temp folder on the Herdr host, checks every mod there and removes the temp folder, pass or fail. The host's real mods folder isn't touched.
- Herdr's own docs (`AGENTS.md`) and type files live in the Herdr home on the host, not here.

## Before you commit

The watch only writes into Herdr. Build into the repo and check:

```bash
vp run -r build       # writes mods/iangregsondev-<name>/ (commit it with the source)
vp run verify         # format, lint, type-check, all tests, config audit
vp run check:mods     # herdr-app check on every built mod, on the dev target's Herdr host
```

CI fails if `mods/` doesn't match the source. Every PR also needs a changeset, an empty one when nothing is released: see [Releases](#releases).

## Start a new mod

A mod needs only a few files. Make them in `apps/<name>/`, with `<name>` the short name.

`package.json`. Keep `"version"` at `0.0.0`: the release workflow moves it.

```json
{
  "name": "<name>",
  "version": "0.0.0",
  "private": true,
  "description": "Herdr mod: <what it does, in one line>.",
  "type": "module",
  "scripts": {
    "build": "vp pack",
    "dev": "vp pack --watch",
    "test": "vp test"
  },
  "devDependencies": {
    "vite-plus": "catalog:"
  }
}
```

`vite.config.ts`. `modPack` gives the shared build settings and the mod id.

```ts
import { defineConfig } from "vite-plus";
import { modPack } from "../../mod-pack.ts";

export default defineConfig({
  pack: modPack("<name>"),
});
```

`assets/mod.json` says where the mod first appears. `"place"` is a side such as `"right"`, or `"none"` for a mod with no panel of its own; `"size"` is the panel's width in pixels.

```json
{ "place": "right", "size": 240, "title": "<name>" }
```

`src/main.ts` default-exports a class that extends `View`. Keep it to drawing; logic goes in other modules under `src/`, with tests.

```ts
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme } from "herdr";

type Colors = Record<string, `#${string}`>;

export default class Main extends View {
  render() {
    // theme() is typed as plain strings, but the style methods want hex colours.
    const t = theme() as Colors;
    return v_flex()
      .size_full()
      .p(10)
      .bg(t.surface)
      .text_color(t.foreground)
      .child(div().child(__MOD_ID__));
  }
}
```

`assets/RECIPE.md` and `assets/preview.png`: see [Recipe and preview](#recipe-and-preview). Write them once the mod works.

Herdr's `AGENTS.md` is the source of truth for these shapes; check them against it. Then:

1. Run `vp install`. To use Effect, run `vp -C apps/<name> add -D effect @effect/vitest` and check the diff says `"catalog:"`.
2. Run `vp run <name>#dev` and build it up, test-first for pure logic (`apps/<name>/tests/`).
3. Write its `RECIPE.md` and `preview.png` (below).
4. Stop the watch, `vp run dev:remove <name>`, then the steps in "Before you commit", and commit `apps/<name>/` with `mods/iangregsondev-<name>/`.
5. Add a changeset for it: a `minor` bump takes it from `0.0.0` to `0.1.0`, its first release. See [Releases](#releases).

## Recipe and preview

Herdr's shared-mod format expects both in every mod folder. Its rules are in `~/.config/herdr-app/AGENTS.md`, section "Layouts and mods other people made". Read that section before writing: Herdr updates it.

- Keep both in `apps/<name>/assets/`. The build copies them into `mods/iangregsondev-<name>/`.
- **`RECIPE.md`** is a brief another agent could rebuild the mod from, starting with an empty folder. Its sections, in order: `# Name` with one paragraph and `![Name](preview.png)`, then **What you see**, **How it behaves**, **Built from**, **Watch out** and **Done when**. Write it from the real files, exact over vague. `apps/worktrunk/assets/RECIPE.md` shows the shape.
- **`preview.png`** is a screenshot of the mod. Take one with `vp run herdr shot apps/<name>/assets/preview.png --crop x,y,w,h` while the dev build runs, cropped to the mod alone. This repo is public, so nothing else from your window may show: other panels, repo or branch names, paths, terminal text.
- Update the recipe in the same change as any behaviour change.
- Don't write a version in the source recipe. Every build adds one line under the title of the copied `RECIPE.md`: `Version <x.y.z> · [Changelog](<link>)`, from the mod's `package.json` (`scripts/recipe-stamp.ts`, called by `mod-pack.ts`).

To list it on herdr.dev/mods, the repo needs the `herdr-mod` topic (already set).

## Releases

Each mod has its own **mod version**, in `apps/<name>/package.json`. A change to one mod never moves another's. Versions come from [changesets](https://github.com/changesets/changesets), set up in `.changeset/config.json`. Nothing goes to npm or any registry.

### What a changeset is

A **changeset** is a small Markdown file in `.changeset/`, added with your change. It names the mods the change reaches, how far each one's version moves, and what a user of that mod sees. When a release is made, its text becomes that mod's **changelog** entry (`apps/<name>/CHANGELOG.md`), so write it for the mod's users, not for the repo.

```md
---
"worktrunk": patch
---

The Clean up view no longer lists the main worktree.
```

### When you need one

Every PR carries a changeset. When the PR releases nothing, that is an **empty changeset**: one that names no mods.

| You changed                            | You need                                               |
| -------------------------------------- | ------------------------------------------------------ |
| anything under `apps/<name>/`          | a changeset that names `<name>`                        |
| anything under `packages/`             | a changeset: name the mods it reaches, or an empty one |
| a mod's whole folder, deleted          | nothing for that mod, but still a changeset for the PR |
| anything else (root scripts, docs, CI) | an empty changeset (`vp exec changeset --empty`)       |

Editing or deleting a changeset already waiting in `.changeset/` doesn't count: the PR must add one.

CI checks this on every PR (`vp run check:changesets`, `scripts/changeset-check.ts`). It fails when the PR adds no changeset, or names each changed mod that no changeset names, and tells you the command to add one. You can run it yourself before you push: it compares your branch with `origin/main`. Two PRs are exempt: the version PR (below) and Dependabot PRs (head branch `dependabot/...`), which only bump pinned GitHub Actions and never release a mod.

### Bump rules

- **major**: the user must act. A layout slot changes, the settings format changes, the mod id is renamed.
- **minor**: new behaviour.
- **patch**: a fix.
- While a mod is at `0.x`, a breaking change bumps the **minor**, not the major.

### Add one

```bash
vp exec changeset           # asks which mods, the bump for each, and the summary
vp exec changeset --empty   # a change with nothing for users (docs, root scripts, CI, an internal refactor in packages/)
```

Or write the file by hand, in the shape above. Commit it with the change. One changeset can name several mods, each with its own bump.

**A change in `packages/`.** `worktrunk-mailbox` has no version or changelog of its own: users never see it, only the mods it is bundled into. So name the mods it reaches and write what their users see ("The New worktree item opens the dialog even when the panel is hidden"), not what changed in the package. If users see nothing, add an empty changeset.

### From changeset to release

1. Your PR merges into `main` with its changeset.
2. The release workflow (`.github/workflows/release.yml`) opens or updates a PR titled `chore: version packages`, the **version PR**. It runs `vp run version` (`changeset version`, then `vp check --fix`, then `vp run -r build`), so the PR holds each mod's new version, its changelog entry and a rebuilt `mods/` whose `RECIPE.md` shows the new version. It uses up the changesets. Leave `vp run version` to the workflow: it rewrites versions and changelogs, and needs a GitHub token. More merges to `main` keep updating it.
3. You merge the version PR when you want a release.
4. The workflow then makes one **release** per bumped mod: a git tag and a GitHub release, carrying that version's changelog entry.

Tags and releases use the mod id, not the package name: `iangregsondev-worktrunk@0.1.0`, never `worktrunk@0.1.0` ([ADR 0004](adr/0004-release-tags-use-mod-ids.md)). `vp run release:tags` (`scripts/release-tags.ts`) lists each mod whose tag isn't on GitHub yet, and the workflow makes those. A mod still at `0.0.0` has never been released and gets no tag. Once every tag exists, a run of the workflow makes nothing.

The CI changeset check skips the version PR: it changes mods but adds no changesets. It skips Dependabot PRs too (see [When you need one](#when-you-need-one)).

### A harmless warning

Every `changeset` command prints these lines, then carries on and exits 0:

```text
Package menus must depend on the current version of worktrunk-mailbox: 0.0.0 vs catalog:
Package worktrunk must depend on the current version of worktrunk-mailbox: 0.0.0 vs catalog:
```

The mods take `worktrunk-mailbox` through `catalog:`, and changesets ignores that package on purpose (`ignore` in `.changeset/config.json`). Nothing is wrong; ignore the lines.

### Backfill

Changes made before changesets came in are backfilled, so each mod's first release, `0.1.0`, lists the PRs that built it. There is one changeset per past PR per mod, each with a `pr: #N` line at the top of its text, which makes the changelog link that PR and its author. Today that is menus and worktrunk, both from #17.
