---
paths:
  - ".claude/**"
  - "CLAUDE.md"
---

# Claude config in this repo

This repo is public, and `.claude/settings.json` is tracked: everyone who clones it gets it.

- **Never put `permissions` in `.claude/settings.json`.** Allow and deny lists are personal; they go in `.claude/settings.local.json` (untracked) or your user settings.
- **Tracked settings hold only what every contributor needs:** the hooks in `.claude/hooks/`. Each hook is a small `sh` script with a header comment saying when it runs and what it blocks.
- **No local paths, hostnames or machine details** in any tracked file under `.claude/`. Refer to the repo with `$CLAUDE_PROJECT_DIR`.
- **Rules (`.claude/rules/*.md`) carry `paths:` globs** that must match real files. A glob that matches nothing never loads its rule.
- **Skills in `skills-lock.json` are upstream copies.** Don't edit them; update through the lock. The repo's own skills (such as `audit`) sit beside them, outside the lock.
- **Run `vp run audit:config`** after moving or renaming files; the `audit` skill covers the rest.
