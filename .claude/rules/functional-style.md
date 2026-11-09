---
paths:
  - "apps/*/src/**"
  - "packages/*/src/**"
  - "scripts/**"
---

# Functional style

Pure modules (no `herdr` or `gpui-*` imports) are written as plain functions over immutable data. A mod's `main.ts` is exempt from `no-let`, `no-loop-statements`, `immutable-data` and `no-throw-statements`: its `View` is a class Herdr drives through `init` and `render`.

`vp check` enforces the rules marked **(lint)** through a local oxlint plugin, `scripts/oxlint-functional.ts`. The lint goes by path, not by imports: it applies to every file under `apps/*/src/` and `packages/*/src/` except a mod's `main.ts`, whatever that file imports. So shell code (a `View`, anything Herdr mutates) belongs in `main.ts`; a second shell file in `src/` fails the lint. The lint reads syntax only, with no type information. The rest is on you. `scripts/` and `mod-pack.ts` get only the cast rule, but write new scripts this way where it's easy.

## Shape

- **Pure core, thin shell.** Logic lives in pure modules: data in, data out, tested in `tests/`. `main.ts` is the shell: it reads from `herdr` (spaces, theme, `exec`), calls the pure functions, and renders. Keep it thin.
- **Make illegal states unrepresentable.** A tagged union (`Data.taggedEnum`, or a plain `{ _tag: ... }` union) beats an object of optional fields that can contradict each other. Keep look-alike strings and numbers apart with branded types (`Brand.nominal`).

## Data

- **`const` only (lint: `no-let`).** No `let` or `var`. Need a value that changes? Compute it once from its inputs.
- **No loops (lint: `no-loop-statements`).** Use `map`, `filter`, `reduce`, `flatMap` or recursion.
- **No mutation (lint: `immutable-data`).** Build new values with spread, `map`, `slice` and `[...xs].sort()` (the build targets ES2022, so no `toSorted` or `toSpliced`). Never assign to a property (destructuring into one, `[xs[0]] = [1]` or `({ a: o.a } = p)`, counts), `delete`, call `push`, `sort`, `splice` and friends, call a `Map` or `Set` mutator (`set`, `add`, `delete`, `clear`), or use `Reflect.set`, `Reflect.deleteProperty` or `Reflect.defineProperty` on shared data. A copy made in the same expression may be changed: `[...xs].sort()`, `xs.slice().sort()`, `xs.map(f).sort()`, `Array.from(s).sort()`, `Object.entries(o).sort()`, `new Map().set(k, v)`. The lint goes by method name, so a user-defined `add` or `set` on shared data is flagged too.
- **Casts say why (lint: `explained-cast`, `main.ts`, `scripts/` and `mod-pack.ts` too).** Before `as`, try a type guard, a better type or a generic. A cast that's still needed gets a comment saying why, either on its own line just above the cast or on the cast's own line. For a cast that spans lines, both are measured from the line holding `as` (or the `<T>`). A directive comment (`oxlint-disable…`, `eslint-disable…`) is not a reason, and neither is a trailing comment on the line above that belongs to other code. `as const` and `<const>` are fine.

## Failure

- **No `throw` (lint: `no-throw-statements`).** Failure is a value.
- **Total functions.** Every input gets an answer. Handle empty lists, zero and missing keys. Absence is an `Option` (`Option.fromNullishOr` turns a nullable into one); failure is a `Result` or an `Effect`.
- **`Result` for pure logic, `Effect` for effects.** Synchronous logic that can fail returns a `Result` (`Result.succeed`, `Result.fail`). Use `Effect` for I/O, async work, services and resources. Never wrap pure logic in `Effect`; convert at the edge with `yield* Effect.fromResult(result)` inside `Effect.gen`, and combine Results with `Result.gen`. A bare `yield* result` inside `Effect.gen` is a type error, and without the type check it dies as a defect.
- **Tagged errors.** One error class per failure mode, so the type lists every way a call can fail and callers handle each with `Effect.catchTag` or `Effect.catchTags`. Inside `Effect.gen`, fail with `return yield* new MyError(...)`. For `Data.TaggedError` versus `Schema.TaggedError`, see `.claude/rules/effect.md`.
- **Typed errors for what a caller can handle; defects for bugs.** "Not found" or "git not installed" is a tagged error in the type. A broken invariant (a state that can't happen) is a defect: turn an error nobody can recover from into one with `Effect.orDie`. Catch defects only at the edge, to log them (`Effect.exit`, `Effect.catchDefect`).
- **Parse, don't validate.** Turn outside data (`exec` output, files, `fetch`) into a typed value once, at the edge, with `Schema`. Past that point, code trusts the type and never re-checks. For quick runtime checks use `Predicate` (`Predicate.isString`, `Predicate.isObject`), never a hand-written `isString`.

## Effect v4, not v3

`effect` here is v4. Code and examples written for v3 (much of what's online, and other repos) use APIs that no longer exist. Check an API in `node_modules/effect` before using it. The common traps:

| v3 (don't use)                                                      | v4                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Either`, `Either.right` / `left`                                   | `Result`, `Result.succeed` / `fail`                                                                     |
| `Context.Tag`, `Context.GenericTag`, `Effect.Tag`, `Effect.Service` | `class X extends Context.Service<X, Shape>()("id")`, with an explicit `Layer.succeed` or `Layer.effect` |
| static service accessors (`Svc.method()`)                           | `yield* Svc`, or `Svc.use((svc) => ...)`                                                                |
| `Effect.catchAll`, `Effect.orElse`                                  | `Effect.catch`                                                                                          |
| `Effect.either`                                                     | `Effect.result`                                                                                         |
| `Option.fromNullable`                                               | `Option.fromNullishOr`                                                                                  |

## Writing Effect

- **`Effect.gen` for inline code; `Effect.fn("name")` for a reusable function** (`Effect.fnUntraced` when tracing isn't useful). Don't write a function that only wraps and returns an `Effect.gen`. Add behaviour with `.pipe(...)` on `Effect.gen`, or as extra arguments to `Effect.fn` (never `.pipe` on `Effect.fn`).
- **Check Effect's modules before writing a helper:** `Array`, `Record`, `Option`, `Result`, `Match`, `Predicate`, `Schema`. Many problems are already solved.
- **Promises inside Effect code** go through `Effect.tryPromise`, so a rejection becomes a typed error rather than a defect.

## Exceptions

Want an exception to a lint rule? Fix the design first. If it truly can't be avoided, disable the one rule on the one line (`oxlint-disable-next-line functional/<rule>`) with a comment saying why.
