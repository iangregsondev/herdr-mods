---
paths:
  - "apps/*/tests/**"
  - "packages/*/tests/**"
  - "scripts/*.test.ts"
---

# Tests

- Tests live in `<package>/tests/*.test.ts`, beside `src/`. Root scripts keep theirs beside them (`scripts/*.test.ts`).
- Plain tests import from `vite-plus/test`. Tests of Effect code import from `@effect/vitest` instead (below); it re-exports all of Vitest, so one file never needs both.
- `herdr` and `gpui-kit` exist only inside the Herdr app, so tests import pure modules only. Gate the UI with `vp run check:mods` after `vp run -r build`, and prove it in the dev loop (`.claude/rules/dev-loop.md`).
- Run with `vp run -r test`, or `vp -C apps/<name> test` for one package. Root scripts: `vp test scripts`.

## Test doubles

- Prefer real objects, then hand-written fakes that return known data. Reach for `vi.fn` or `vi.mock` only when a fake is impractical.
- Fake an Effect service with a layer: `Layer.succeed(Users, { find: (id) => Effect.succeed("Ann") })`, given to the program with `Effect.provide`. `Layer.mock(Users)({ ... })` takes a partial fake; a member you leave out fails if it's called.

## Testing Effect code

Use `@effect/vitest`, as `node_modules/effect/AGENTS.md` does (its examples: `node_modules/effect/ai-docs/src/09_testing/`). It's a root dev dependency; an app whose tests use it adds `"@effect/vitest": "catalog:"` to its own `package.json`, like `effect`. It runs on the same Vitest as `vp test` and never ships in a mod.

```ts
import { assert, describe, it, layer } from "@effect/vitest";
import { Effect, Schema } from "effect";

describe("Users", () => {
  it.effect("finds a user", () =>
    Effect.gen(function* () {
      const users = yield* Users;
      assert.strictEqual(yield* users.find("1"), "Ann");
    }).pipe(Effect.provide(Users.layerTest)),
  );

  it.effect("fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip((yield* Users).find("2"));
      assert.strictEqual(error._tag, "NotFound");
    }).pipe(Effect.provide(Users.layerTest)),
  );
});

// One layer for every test in the block.
layer(Users.layerTest)("Users, shared layer", (it) => {
  it.effect("finds a user", () =>
    Effect.gen(function* () {
      /* ... */
    }),
  );
});
```

- **`it.effect`** runs an Effect as the test: no `runPromise`. A failure, a defect or a failed `assert` fails the test.
- **Expected failures are values**, never `try`/`catch`: `Effect.flip` swaps the error into the success channel; `Effect.result` gives a `Result` to check.
- **`it.effect.each(cases)(name, fn)`** runs one test per case; **`it.effect.prop(name, [Schema.Int], ([n]) => ...)`** checks a property against generated values. A property that fails is reported with the run count; check the property's own logic before blaming the code.
- **Time:** `it.effect` runs on `TestClock`, so `Effect.sleep` waits until `TestClock.adjust` (`effect/testing`) moves time on. `it.live` uses the real clock. Mod code can't wait on time anyway (`.claude/rules/effect.md`), so this matters only for tests of non-mod code.
- `layer(...)` shares one instance across its block, so state can leak between tests. Prefer `Effect.provide` per test unless the layer is costly.

## The test-first contract

Write behaviour test-first with the `mattpocock-skills:tdd` skill. It owns the loop: seams, vertical slices, good and bad tests. These rules sit on top of it:

- **Red for the right reason.** Before writing code, run the new test and read the failure. It must fail on the behaviour you're adding (a wrong value, a missing export), not on a typo, a bad import or a broken fixture. Fix the test until it fails for the right reason, then write the code.
- **Never weaken a failing test.** Don't loosen an assertion, delete a case, add `.skip` or `.todo`, or change the expected value to match what the code returns. The test is the spec; change the code.
- **Stop and say so when the code can't pass the test as written.** If a test looks wrong, or passing it would need a change outside the task, stop. Tell the person which test, what it asks for and why the code can't meet it. They decide whether the test changes.
- **A bug fix starts with a test** that reproduces it and fails, then the fix.
