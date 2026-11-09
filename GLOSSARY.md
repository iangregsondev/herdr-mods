# herdr-mods

Mods and layouts for the Herdr app, built from this one repo and shared for others to install.

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
A named folder (such as Work or Personal) that holds repos. A repo belongs to the deepest group folder that contains it, or to Other.
_Avoid_: category, workspace

**Current repo**:
The repo holding the folder of the pane that has focus in Herdr. There is none when that folder is outside every repo.
_Avoid_: active repo (active means in-progress work here)

**Space**:
A Herdr space: a sidebar entry that holds tabs, usually opened on one worktree's folder.
_Avoid_: workspace
