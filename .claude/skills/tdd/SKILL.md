---
name: tdd
description: >
  The TDD loop for this repo. Use whenever writing or changing behaviour in apps/**, packages/** or scripts/**:
  a feature, a bug fix, a review finding, or a ticket from /implement or /implement-spec, in the main thread or a
  subagent, and on any mention of TDD. The test is written, seen failing on an assertion, and shown BEFORE any code.
  Not needed for docs, config, the View glue in main.ts, or pure refactors with existing coverage.
---

# TDD loop: herdr-mods

**The test is the spec.** Once a test fails for the right reason, it is never weakened to fit the code. For what a good test is (public interface, no internals, seams), read `mattpocock-skills:tdd`; this skill is the loop and its gate. Hard rules: `.claude/rules/tests.md`.

One behaviour per cycle. Never write a whole test file and then the whole module: that is test-first, not TDD.

## 1. Pick one behaviour

The smallest next thing the code must do, said as a rule ("a merged worktree sorts after active ones"). Choose the test file in `<package>/tests/`. Plain tests import `vite-plus/test`; tests of Effect code import `@effect/vitest`.

## 2. Write one test

Precise assertions through the module's public interface, designed so the test never needs changing later. Use fakes and Effect test layers over `vi.fn` and `vi.mock`.

## 3. See red, on an assertion

```sh
vp -C apps/<name> test tests/<file>.test.ts
```

Read the failure. It must be a failed assertion on this behaviour. "Cannot find module", a missing export, a type error or a broken fixture is not red: add a stub export that returns a wrong value (`return []`, `Option.none()`), and run again.

## 4. Gate

Show the test and the failure lines.

- **Main thread:** stop for the user's review before step 5. Don't go on without a yes.
- **Subagent:** you can't stop for the user, so record it. Your final report lists, for every cycle, the test name and its red failure line (copied from the run output). The main thread rejects a report without them, and runs one test back to red on its own to check.

## 5. Write the least code that passes

Follow `.claude/rules/functional-style.md`, and `.claude/rules/effect.md` for anything that touches Herdr's API: it goes through an Effect service with tagged errors.

## 6. See green

Run the same command as step 3. Then the package's full tests: `vp -C apps/<name> test`.

## 7. Refactor

Better names and structure while green. Run the tests again.

## 8. Next behaviour

Back to step 1. Commit when a slice of behaviour is whole; `vp check` before each commit.

## If the code can't pass the test as written

Don't weaken it: no looser assertion, no deleted case, no `.skip`, no expected value changed to match the code. Stop and tell the user which test, what it asks for, what exists, why they don't meet, and a fix you'd suggest. They decide.
