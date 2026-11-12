---
paths:
  - "apps/**"
---

# Every mod ships a recipe and a preview

Herdr's shared-mod format (`~/.config/herdr-app/AGENTS.md`, section "Layouts and mods other people made") expects each mod folder to carry a `RECIPE.md` and a `preview.png`. Installers read the recipe first, then leave both out of the install.

- Keep both in `apps/<name>/assets/`. The build copies `assets/*` into `mods/<name>/`.
- Write `RECIPE.md` from the real files, in the order and with the sections that AGENTS.md section gives (title, paragraph and `![Name](preview.png)`, then What you see, How it behaves, Built from, Watch out, Done when). Read that section before writing; Herdr updates it. Copy `apps/hello/assets/RECIPE.md` for the shape.
- Update the recipe in the same change as any behaviour change, so it never describes a mod that isn't there.
- Make `preview.png` with `vp run herdr shot apps/<name>/assets/preview.png --crop x,y,w,h`, cropped to the mod alone. The repo is public: nothing else from the window (other panels, repo or branch names, paths, terminal text) may show.
