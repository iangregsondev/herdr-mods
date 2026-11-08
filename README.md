# herdr-mods

Mods and layouts for the [Herdr app](https://herdr.dev), written in TypeScript and built with [Vite+](https://viteplus.dev).

## Install a mod

Each mod's built files are in `mods/<name>/`. Ask your agent:

> Read ~/.config/herdr-app/AGENTS.md, then add the mod at github.com/<owner>/herdr-mods/tree/main/mods/<name>

## Develop

```bash
vp install            # also links the Herdr app's types (docs/types.md)
vp run -r build       # apps/<name>/src -> mods/<name>/main.js
vp run -r test
vp check              # format, lint, type-check
vp run check:mods     # herdr-app check on every built mod
```

Layout and conventions: [docs/structure.md](docs/structure.md).
