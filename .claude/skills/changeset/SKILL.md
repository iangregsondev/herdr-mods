---
name: changeset
description: >
  Write this repo's changeset for a change: whether it releases anything, which mods, which bump, and the text a
  mod user reads. Use whenever a PR is being prepared (/implement, /implement-spec, the pr skill) or a changeset is
  mentioned.
---

# Write a changeset

Every PR adds a changeset. Bump meanings and the rules behind them: `.claude/rules/changesets.md`. Work through the four decisions in order, then write the file.

## 1. Does it release anything?

A change releases something when a mod user sees a difference: a file changed under `apps/<name>/`, or a `packages/` change that reaches a mod's behaviour.

Docs, root scripts, CI, hooks, tests, config, and `packages/` changes users never see release nothing: write an **Empty changeset** and skip to step 5.

## 2. Which mods?

- Each mod with a changed file under `apps/<name>/` (the `name` in its `package.json`, not the mod id). A mod the PR deletes is left out.
- For `packages/`, the mods that bundle the changed code and whose users see the change. `worktrunk-mailbox` itself is never named.

Done when every mod in `git diff --name-only origin/main...HEAD -- apps/` is named or deleted.

## 3. Which bump?

Use the bump the spec or ticket's **Changeset** line names. If it names none and the rule's bump meanings don't settle it:

- **Main thread:** ask the user, giving your pick.
- **Unattended subagent:** stop and report the unclear bump as a blocker. Guessing ships the wrong version.

## 4. The text

One or two sentences a user of that mod would understand: what they see now, in the mod's own words (its views, items, settings). For `packages/`, describe what the mod's users see, not what changed in the package. An empty changeset needs no text.

## 5. Write the file

Write `.changeset/<kebab-summary>.md` by hand (the summary in a few words, such as `cleanup-skips-main.md`). The interactive `vp exec changeset` prompts can't be driven by an agent.

A mod changeset, one line per mod:

```md
---
"worktrunk": patch
---

The Clean up view no longer lists the main worktree.
```

An empty changeset (the same file `vp exec changeset --empty` writes):

```md
---
---
```

## 6. Check

Run `vp run check:changesets`. Done when it passes; fix what it names otherwise. Commit the changeset with the change.
