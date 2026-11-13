# herdr-mods

Mods and layouts for the Herdr app, built from this one repo and shared for others to install, and the dev loop that runs them while they are written.

## Dev loop

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

## Mods

**Mod name**:
The short name a mod has inside this repo, such as `worktrunk`. Only the repo sees it.
_Avoid_: mod id (when you mean the short name)

**Mod id**:
The name Herdr knows a mod by once it is installed: the namespace, a hyphen, then the mod name, such as `iangregsondev-worktrunk`.
_Avoid_: folder name, plugin name

**Namespace**:
The prefix every mod id from this repo starts with, `iangregsondev`. It keeps these mods from clashing with Herdr's own mods or anyone else's.
_Avoid_: scope, vendor

## Worktrunk

**Repo**:
A git repository with one main checkout and any number of worktrees.
_Avoid_: project

**Worktree**:
One checkout of a repo on one branch. The main checkout is a worktree too.
_Avoid_: checkout (except for the main checkout), clone

**Group**:
A named folder (such as Work or Personal) on one machine that holds repos. A repo belongs to the deepest group folder on its machine that contains it, or to Other.
_Avoid_: category, workspace

**New worktree**:
A linked worktree with no commits and no changes of its own, whose branch is still at main's tip or at the main checkout's commit (a main checkout that hasn't pulled lags main's tip). Nothing in it to clean up yet.
_Avoid_: empty worktree

**Merged worktree**:
A linked worktree whose work is already in main, or whose branch never got a commit while main moved on. Ready to clean up.
_Avoid_: done, finished

**Current repo**:
The repo holding the folder of the pane that has focus in Herdr. There is none when that folder is outside every repo.
_Avoid_: active repo (active means in-progress work here)

**Space**:
A Herdr space: a sidebar entry that holds tabs, usually opened on one worktree's folder. Every space lives on one machine.
_Avoid_: workspace

**Machine**:
A computer that Herdr's spaces live on, named as Herdr names it (`hc machine ls`). Every repo and every space is on exactly one machine. The same repo cloned on two machines is two repos.
_Avoid_: remote, server, host (Herdr host means the computer running the Herdr app)

**This machine**:
The machine the Herdr app itself runs on. Any other machine is reached over SSH.
_Avoid_: local (except in the dev loop's `local` dev target)
