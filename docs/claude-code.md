# Claude Code in this repo

What the tracked Claude Code setup does, and what to put in your own settings. The agent's rules are in [`CLAUDE.md`](../CLAUDE.md) and `.claude/rules/`; this page is for people.

## Settings files

| File                          | Scope                | Tracked | What goes in it                         |
| ----------------------------- | -------------------- | ------- | --------------------------------------- |
| `.claude/settings.json`       | This repo, everyone  | Yes     | Hooks only. Never `permissions`.        |
| `.claude/settings.local.json` | This repo, just you  | No      | Your permissions for this repo          |
| `~/.claude/settings.json`     | Every repo, just you | No      | Your permissions everywhere (see below) |

## Hooks (apply to everyone)

Both hooks need [`jq`](https://jqlang.org) on your `PATH`. Without it they print why to stderr and do nothing.

| When                    | Script                           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After an edit           | `.claude/hooks/format-edited.sh` | Formats the edited file with `vp fmt`. Never blocks.                                                                                                                                                                                                                                                                                                                                                                              |
| When Claude ends a turn | `.claude/hooks/stop-check.sh`    | Runs `vp run verify` (`vp check --deny-warnings`, every test suite and `vp run audit:config`) unless the tree is clean and merging the branch into the local `origin/main` would change nothing (an untouched or squash-merged branch; it never fetches). On failure it blocks the stop and hands Claude the errors. The next stop after a block goes through unchecked, and so does a run that hits the 600-second hook timeout. |

The Stop hook finds `vp` even when Claude Code was started without your shell profile (desktop app, IDE extension): when `vp` isn't on `PATH`, `.claude/hooks/find-vp.sh` looks in `$VP_HOME/bin` (only when `VP_HOME` is set), then `~/.vite-plus/bin`, then `${XDG_DATA_HOME:-~/.local/share}/vite-plus/bin`. If `vp` or `jq` is missing, the hook says so in one line and the stop goes through.

Checks run at the end of a turn, not after every edit: mid-turn code is often half finished on purpose (a red test, a change across files). Commits made during the turn are still checked, since the pre-commit hook runs no tests.

## Rules and skills

- **Rules** (`.claude/rules/*.md`) load when Claude touches files matching their `paths:` globs; a rule without globs always loads. They cover mod code, Herdr's types (`herdr-types.md`), Effect, functional style, tests, the dev loop, fixing review findings and this config.
- **Repo skills** (`.claude/skills/`): `audit` (config rot), and upstream copies pinned in `skills-lock.json` (`effect-ts`, `effect-v3-to-v4`, `vitest`).
- **Lint backs the rules up.** `vp check` runs oxlint (not ESLint) with Effect's rules, a local plugin for functional style (`scripts/oxlint-functional.ts`) and a ban on leftover `TODO`s and comments that cite reviews.

## Suggested personal permissions

Not enforced by the repo. Put them in `~/.claude/settings.json` so they apply everywhere.

Never let Claude read secrets:

```json
"permissions": {
  "deny": [
    "Read(//**/.env)",
    "Read(//**/.env.*)",
    "Read(//**/*.pem)",
    "Read(//**/*.key)",
    "Read(//**/.npmrc)",
    "Read(//**/.netrc)",
    "Read(~/.ssh/**)",
    "Read(~/.aws/**)",
    "Read(~/.gnupg/**)"
  ]
}
```

Ask before anything leaves the machine. A rule in `CLAUDE.md` is advice the agent can drift from; a permission rule stops the call every time:

```json
"permissions": {
  "ask": [
    "Bash(git push:*)",
    "Bash(gh pr create:*)",
    "Bash(gh pr merge:*)",
    "Bash(gh issue create:*)"
  ]
}
```
