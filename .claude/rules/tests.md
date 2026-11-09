---
paths:
  - "apps/*/tests/**"
  - "packages/*/tests/**"
  - "scripts/*.test.ts"
---

# Tests

- Tests live in `<package>/tests/*.test.ts`, beside `src/`, and import from `vite-plus/test`. Root scripts keep theirs beside them (`scripts/*.test.ts`).
- `herdr` and `gpui-kit` exist only inside the Herdr app, so tests import pure modules only. Gate the UI with `vp run check:mods` after `vp run -r build`, and prove it in the dev loop (`.claude/rules/dev-loop.md`).
- Run with `vp run -r test`, or `vp -C apps/<name> test` for one package. Root scripts: `vp test scripts`.

## Test doubles

- Prefer real objects, then hand-written fakes that return known data. Reach for `vi.fn` or `vi.mock` only when a fake is impractical.
- Fake an Effect service with a layer: `Layer.succeed(Users, { find: (id) => Effect.succeed("Ann") })`, given to the program with `Effect.provide`. `Layer.mock(Users)({ ... })` takes a partial fake; a member you leave out fails if it's called.

## Testing Effect code

`@effect/vitest` isn't installed; plain `vite-plus/test` is enough.

- Run with `Effect.runSync` (no async work) or `await Effect.runPromise`.
- Assert an expected failure as a value, never with `try`/`catch`: `const result = Effect.runSync(Effect.result(program))`, then `Result.isFailure(result)` and `expect(result).toMatchObject({ failure: { _tag: "NotFound" } })`. Use `Effect.runPromiseExit` and `Exit.isFailure` when the program is async.
- Nothing that waits on the clock (`Effect.sleep`, `Schedule`) belongs in a mod, so tests don't need `TestClock` (`.claude/rules/effect.md`).

## The test-first contract

Write behaviour test-first with the `mattpocock-skills:tdd` skill. It owns the loop: seams, vertical slices, good and bad tests. These rules sit on top of it:

- **Red for the right reason.** Before writing code, run the new test and read the failure. It must fail on the behaviour you're adding (a wrong value, a missing export), not on a typo, a bad import or a broken fixture. Fix the test until it fails for the right reason, then write the code.
- **Never weaken a failing test.** Don't loosen an assertion, delete a case, add `.skip` or `.todo`, or change the expected value to match what the code returns. The test is the spec; change the code.
- **Stop and say so when the code can't pass the test as written.** If a test looks wrong, or passing it would need a change outside the task, stop. Tell the person which test, what it asks for and why the code can't meet it. They decide whether the test changes.
- **A bug fix starts with a test** that reproduces it and fails, then the fix.
