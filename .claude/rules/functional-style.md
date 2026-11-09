---
paths:
  - "apps/*/src/**"
  - "packages/*/src/**"
  - "scripts/**"
---

# Functional style

Pure modules (no `herdr` or `gpui-*` imports) are written as plain functions over immutable data. A mod's `main.ts` is exempt: its `View` is a class Herdr drives through `init` and `render`. Keep that file thin and push logic into pure modules.

`vp check` enforces the first four rules in `apps/*/src/**` and `packages/*/src/**` through a local oxlint plugin, `scripts/oxlint-functional.ts`. It reads syntax only, with no type information. The rest is on you. `scripts/` isn't linted for style, but write new scripts this way where it's easy.

- **`const` only.** No `let` or `var` (`functional/no-let`). Need a value that changes? Compute it once from its inputs.
- **No loops.** Use `map`, `filter`, `reduce`, `flatMap` or recursion (`functional/no-loop-statements`).
- **No mutation.** Build new values with spread, `map`, `slice` and `[...xs].sort()` (the build targets ES2022, so no `toSorted` or `toSpliced`); never assign to a property, `delete`, or call `push`, `sort`, `splice` and friends on shared data (`functional/immutable-data`). A value made in the same expression (`[...xs].sort()`) is fine.
- **No `throw`.** Failure is a value: a `Data.TaggedError` in an `Effect`, or a `Result` (`functional/no-throw-statements`).
- **Total functions.** Every input gets an answer. Handle empty lists, zero and missing keys; return `Option` or `Result` instead of assuming.
- **Parse, don't validate.** Turn outside data (`exec` output, files, `fetch`) into a typed value once, at the edge, with `Schema`. Past that point, code trusts the type and never re-checks.
- **Tagged errors.** Each failure is its own `Data.TaggedError("Name")` class, so callers handle it with `Effect.catchTag` and the type lists every way it can fail.
- **`Result` or `Effect`?** Synchronous logic that can fail returns a `Result`. Reach for `Effect` when it needs services, async work or resource handling. Never wrap a plain value in `Effect` for its own sake.
- **Want an exception to a lint rule?** Fix the design first. If it truly can't be avoided, disable the one rule on the one line, with a comment saying why.
