---
paths:
  - "apps/**"
  - "packages/**"
  - ".changeset/**"
---

# Every mod change carries a changeset

Each mod is versioned on its own with changesets. CI (`vp run check:changesets`) fails a PR that lacks one. The human guide is the "Releases" section of `docs/develop.md`.

- **Changed a file under `apps/<name>/`?** Add a changeset that names `<name>`. A mod the PR deletes needs none.
- **Changed `packages/`?** Name the mods the change reaches, written from their users' view, never the package's. Nothing for users: `vp exec changeset --empty`. `worktrunk-mailbox` never gets a version of its own.
- **Anything else** (root scripts, docs, CI): no changeset.
- **Bump:** major = the user must act (a layout slot, the settings format, a mod id rename); minor = new behaviour; patch = a fix. At `0.x`, a breaking change bumps the minor.
- **Add it** with `vp exec changeset`, or write `.changeset/<kebab-summary>.md` by hand: frontmatter lines `"<name>": <bump>`, then one or two sentences a mod user would understand. Commit it with the change.
- **Before a PR** (`/implement`, `/implement-spec`, the `pr` skill): run `vp run check:changesets` and fix what it names.
- Never run `vp run version`, never edit a mod's `version` or `CHANGELOG.md`, and never make release tags: the release workflow does all three.
- `changeset` commands print "Package … must depend on the current version of worktrunk-mailbox: 0.0.0 vs catalog:". It is expected; ignore it.
