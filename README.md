# herdr-mods

Mods and layouts for the [Herdr app](https://herdr.dev), written in TypeScript and built with [Vite+](https://viteplus.dev).

## Install a mod

Each mod's built files are in `mods/<name>/`, with a `RECIPE.md` (what it does) and a `preview.png`. Paste one of these prompts into your coding agent, with `<name>` swapped for the mod's folder name.

From GitHub:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/iangregsondev/herdr-mods/tree/main/mods/<name>

From a local clone (nothing needs pushing):

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: <path-to-your-clone>/mods/<name>

Either way, the agent copies the folder into `~/.config/herdr-app/mods/` and runs `herdr-app check` on it. The copy is a snapshot: it doesn't follow later changes. To work on a mod and see each save live, use the dev loop below instead.

## Develop

```bash
vp install                # also links the Herdr app's types (docs/types.md)
vp run <name>#dev         # live: builds into ~/.config/herdr-app/mods/<name>/ and shows its panel; Herdr reloads on every save
vp run dev:remove <name>  # done (stop the watch first): removes the dev build and its panel from Herdr
```

Before you commit:

```bash
vp run -r build       # apps/<name>/src -> mods/<name>/main.js (commit mods/)
vp run -r test
vp check              # format, lint, type-check
vp run check:mods     # herdr-app check on every built mod
```

Full guide, including starting a new mod and writing its recipe: [docs/develop.md](docs/develop.md). Layout and conventions: [docs/structure.md](docs/structure.md).
