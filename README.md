# herdr-mods

Mods and layouts for the [Herdr app](https://herdr.dev), written in TypeScript and built with [Vite+](https://viteplus.dev).

## Install a mod

Each mod's built files are in `mods/iangregsondev-<name>/`, with a `RECIPE.md` (what it does) and a `preview.png`. Every mod here is installed under the `iangregsondev-` namespace, so it never clashes with Herdr's own mods or anyone else's. Paste one of these prompts into your coding agent, with `<name>` swapped for the mod's name.

From GitHub:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/iangregsondev/herdr-mods/tree/main/mods/iangregsondev-<name>

From a local clone (nothing needs pushing):

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: <path-to-your-clone>/mods/iangregsondev-<name>

Either way, the agent copies the folder into `~/.config/herdr-app/mods/` and runs `herdr-app check` on it. The copy is a snapshot: it doesn't follow later changes. To work on a mod and see each save live, use the dev loop below instead.

## Removed mods

`iangregsondev-hello` was a small example mod, and it is gone. If you installed it, delete its folder: `~/.config/herdr-app/mods/iangregsondev-hello/`.

## Develop

```bash
vp install                # also puts the Herdr app's types in .herdr-types/ (docs/types.md)
vp run <name>#dev         # live: builds into the Herdr app's mods/iangregsondev-<name>/ and shows its panel; Herdr reloads on every save
vp run herdr status       # herdr-app on the same Herdr; also `vp run herdr shot <file> --crop x,y,w,h`
vp run dev:remove <name>  # done (stop the watch first): removes the dev build and its panel from Herdr
```

Herdr on another machine? Copy `herdr-dev.example.json` to `herdr-dev.json` and fill in the Herdr host: every command above then works over SSH. See [docs/develop.md](docs/develop.md#remote-herdr-host).

Before you commit:

```bash
vp run -r build       # apps/<name>/src -> mods/iangregsondev-<name>/main.js (commit mods/)
vp run -r test
vp check              # format, lint, type-check
vp run check:mods     # herdr-app check on every built mod
```

Full guide, including starting a new mod and writing its recipe: [docs/develop.md](docs/develop.md). Layout and conventions: [docs/structure.md](docs/structure.md).
