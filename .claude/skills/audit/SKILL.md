---
name: audit
description: Audit this repo's docs and Claude config for rot (dead paths, rule globs matching nothing, stale commands, rules that contradict each other or the code). Use when the user asks to audit or tidy the config, after renaming or moving files, or before a release.
---

# Config rot audit

Config rots quietly: a file moves, and the rule that pointed at it stops loading without an error. Two passes: a script for what can be checked mechanically, then a read for what needs judgment.

## 1. Mechanical pass

Run `vp run audit:config` (`scripts/audit.ts`; CI and the Stop hook run it too). It reports:

- backticked repo paths in tracked docs and rules that don't exist;
- `paths:` globs in `.claude/rules/*.md` that match no tracked file (the rule never loads);
- hook scripts in `.claude/settings.json` that don't exist;
- skills in `skills-lock.json` missing from `.claude/skills/`.

Paths meant to appear later (the first ADR, the first shared package) are listed in `PLANNED` in `scripts/audit.ts`. Add to it only for a path that is truly planned, never to silence a real break.

## 2. Judgment pass

Read `CLAUDE.md`, `docs/`, and every `.claude/rules/*.md`, then check:

- **Commands exist.** Every `vp run <task>` named in a doc is a script in a `package.json` or a task in `vite.config.ts`.
- **No contradictions.** Two rules, or a rule and `CLAUDE.md`, don't give different answers to the same question. The code agrees with what the rules claim (lint settings, build target, file layout in `docs/structure.md`).
- **One home per fact.** The same guidance isn't written out in two places that can drift. Keep it in one, and link to it from the other.
- **Rules are scoped right.** A rule loads where it applies: its globs cover the files it talks about and not much else.
- **Stale working notes.** Files in `.scratch/` whose content now lives in an issue, PR or commit move to `.scratch/archive/`.

## 3. Report and fix

List each finding with its file and the fix. Fix what is clearly in scope (a dead path, a stale glob, a moved command) and re-run `vp run audit:config` until it passes. Ask before deleting a rule or changing what one says.
