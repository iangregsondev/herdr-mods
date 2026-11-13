# Release tags and GitHub releases use the mod id

Each mod is versioned on its own with changesets, and a release is a git tag plus a GitHub release. Changesets names tags after the package (`worktrunk@0.1.0`), but the package name is the repo-only mod name. Users know a mod by its mod id, so tags and releases are named `iangregsondev-<name>@<version>`. A small publish script writes the tag events that `changesets/action` turns into tags and releases, putting the mod id in the tag and the package name beside it so the action still finds the right changelog.

## Considered Options

- **Changesets' default tags (`worktrunk@0.1.0`)**: rejected. No script, but the public tag shows a name users never see anywhere else.
- **Rename the packages to the mod id**: rejected. Every command (`vp run <name>#dev`, `dev:remove <name>`) takes the short name (ADR 0002).

## Consequences

Tags are public and permanent: changing the format later leaves old releases under the old names, and anything that links to them breaks.
