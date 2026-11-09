# Contributing to herdr-mods

Thanks for helping. This page says how work moves from an idea to a merged change. Repo layout: [`docs/structure.md`](docs/structure.md).

## How work flows

1. **Issue.** Open one with a template: [feature](.github/ISSUE_TEMPLATE/feature.md), [task](.github/ISSUE_TEMPLATE/task.md), [bug](.github/ISSUE_TEMPLATE/bug.md) or [idea](.github/ISSUE_TEMPLATE/idea.md). Fill in every section; write `None` where one doesn't apply.
2. **Grill.** The idea is questioned until it's clear. New terms go into `GLOSSARY.md`; hard-to-reverse decisions become ADRs in `docs/adr/`.
3. **Spec.** One issue that describes the whole change.
4. **Tickets.** The spec is split into small issues, each buildable and testable on its own.
5. **Implement.** Each ticket is built test-first. One pull request carries the whole spec.
6. **Merge.** Only the owner merges.

Much of this is done with a coding agent. Its version of these rules is in [`CLAUDE.md`](CLAUDE.md). Where this page and `CLAUDE.md` disagree, `CLAUDE.md` wins. What the agent's hooks do, and suggested personal settings: [docs/claude-code.md](docs/claude-code.md).

## Issue types

- **Feature** (issue type): new behaviour, such as a new mod or a change to one.
- **Task** (issue type): a chore, such as tooling, docs, CI or upkeep.
- **Bug** (issue type and `bug` label): something broken.
- **Idea** (`idea` label): a maybe. A grill picks it up, or it's closed as not planned with the reason.

## Branches

Never commit to `main`. Work on a branch named `<type>/<issue>-<short-description>`:

- `<type>` is a Conventional Commits type: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, and so on.
- `<issue>` is the GitHub issue number. With no issue, leave it out.
- `<short-description>` is kebab-case.

Examples: `feat/12-pr-list-mod`, `fix/15-hello-empty-state`, `chore/initial-setup`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.

- Write the description in the imperative, lower-case, with no full stop.
- The scope is optional. Use the mod's name when the change sits in one mod: `fix(hello): …`.
- Mark a breaking change with `!` and a `BREAKING CHANGE:` footer. For a mod, breaking means anything that breaks an installed copy: a renamed folder, changed keys, or moved state.
- When the commit belongs to an issue, add a `Refs #123` footer.

## Tests and checks

**Test-first by default.** New behaviour and bug fixes start with a failing test, then the code that makes it pass.

- Tests cover the pure logic in `apps/<name>/src`. The UI is checked with `herdr-app check`.
- Never weaken a failing test to make it pass.

Before you push:

```bash
vp run verify         # format, lint, type-check (needs the Herdr app for types), all tests, config audit
vp run -r build       # commit the updated mods/
vp run check:mods     # herdr-app check on every built mod
```

CI runs `vp run verify` and the build, and fails if `mods/` doesn't match the source. Two checks run only on your machine, because they need the Herdr app: the type-check (CI turns it off) and `herdr-app check`.

## Opening a pull request

- Fill in every section of the [pull request template](.github/pull_request_template.md). Write `None` where one doesn't apply.
- Title it as a Conventional Commit. It becomes the squash commit on `main`.
- Under **Related issues**, write `Closes #123` for each issue it completes. Write a plain `#123` for issues it only relates to.

## This repository is public

Keep local paths, hostnames, usernames and other machine details out of issues, pull requests and commit messages.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
