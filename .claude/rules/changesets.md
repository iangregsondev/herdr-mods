# Every PR carries a changeset

Each mod is versioned on its own with changesets. Every PR adds at least one changeset: one naming the mods it releases, or an **Empty changeset** (no mods in its frontmatter) when it releases nothing. CI (`vp run check:changesets`) fails a PR that adds none. To write one, use the `changeset` skill. The human guide is the "Releases" section of `docs/develop.md`.

- **Changed a file under `apps/<name>/`?** Add a changeset that names `<name>`. A mod the PR deletes is not named.
- **Changed `packages/`?** Name the mods the change reaches, written from their users' view, never the package's. Nothing for users: an empty changeset. `worktrunk-mailbox` never gets a version of its own.
- **Anything else** (root scripts, docs, CI, hooks, tests): an empty changeset.
- **Bump:** major = the user must act (a layout slot, the settings format, a mod id rename); minor = new behaviour; patch = a fix. At `0.x`, a breaking change bumps the minor.
- **Decide it up front.** Every spec and ticket body has a **Changeset** line: `<mod>: <bump>` per mod, or `empty`. The implementer adds the changeset it names.
- **The PR body** has a **Changeset** section (from the PR template). The `pr` skill fills it from the branch's `.changeset/*.md` files: `<mod>: <bump>` per mod, or `empty`.
- **Before a PR** (`/implement`, `/implement-spec`, the `pr` skill): run `vp run check:changesets` and fix what it names.
- Never run `vp run version`, never edit a mod's `version` or `CHANGELOG.md`, and never make release tags: the release workflow does all three.
- `changeset` commands print "Package … must depend on the current version of worktrunk-mailbox: 0.0.0 vs catalog:". It is expected; ignore it.
