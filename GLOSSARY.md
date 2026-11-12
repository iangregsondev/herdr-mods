# herdr-mods

Mods and layouts for the Herdr app, and the dev loop that runs them while they are written.

## Language

**Herdr host**:
The machine running the Herdr app that a dev build goes to.
_Avoid_: Mac, remote, target machine

**Dev target**:
Where dev builds go: `local` (this machine's Herdr app) or `remote` (a Herdr host reached over SSH).
_Avoid_: mode, destination

**Dev build**:
A mod folder in a Herdr host's mods folder that carries the dev marker, made by the dev loop rather than installed.
_Avoid_: dev install

**Installed mod**:
A mod folder in a Herdr host without the dev marker. The dev loop never touches it.

**Slot**:
A block in a layout whose content is a mod. "Panel" is fine in messages to people.
_Avoid_: panel (in code)
