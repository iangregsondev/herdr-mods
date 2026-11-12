# Installed mods carry an `iangregsondev-` namespace

Herdr names a mod by its folder, and that one name is used everywhere: layouts, `keys.json` actions (`<mod>.<command>`) and overlays. Two mods can't share a name, so a plain `worktrunk` would clash with Herdr's own mods or anyone else's. Every mod this repo builds is therefore installed as `iangregsondev-<name>`. Inside the repo (`apps/<name>/`, package names, `vp run <name>#dev`) the short name stays. `mod-pack.ts` holds the namespace in one constant and adds it to the build output, so no mod can forget it. The mod gets the full id as a constant to use for its shared-state keys, its settings file and layouts.

## Considered Options

- **A dot (`iangregsondev.worktrunk`)**: rejected. Commands are written `<mod>.<command>` (and Herdr's own are `space.new`), so a dot in the id makes `iangregsondev.worktrunk.refresh` ambiguous.
- **Prefix only at install time**: impossible. Installs copy the repo's `mods/` folder as it is, so the folder there must already have the full id.

## Consequences

Renaming the namespace later renames every installed mod: users' layouts, keys and saved state would all point at the old id.
