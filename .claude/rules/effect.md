---
paths:
  - "apps/**/src/**"
  - "packages/**/src/**"
---

# Effect in a Herdr mod

Read `node_modules/effect/AGENTS.md` before writing Effect code (CLAUDE.md, "Effect"). These are the limits of Herdr's runtime on top of it:

- **No clock-based operators.** `setTimeout` exists in Herdr but throws ("use cx.timer.after"), so `Effect.sleep`, `Schedule`, `Effect.retry` with a delay, `Effect.timeout` and anything else that waits on time fail at run time. Time things with `cx.timer` and keep Effect for the logic.
- **No `AbortController` or `AbortSignal`.** `Effect.tryPromise({ try: (signal) => ... })` builds an `AbortController` because the callback takes `signal`, and fails with a `ReferenceError`. Write `try: () => ...`.
- **Run effects at the edge.** Inside the `View`, run with `Effect.runSync` (pure work) or `Effect.runPromise` inside `cx.spawn`. Never keep a `cx` inside an effect for later.
- **Each mod bundles its own Effect.** Herdr refuses imports outside a mod's folder, so mods can't share one copy. Import named modules from `"effect"` and let the bundler drop the rest: core costs about 100 KB of `main.js`, `Schema` about 260 KB. Use `Schema` only to parse data from outside (`exec` output, files, `fetch`).
- **Some modules need globals Herdr lacks** (`TextEncoder`, `structuredClone`, `AbortController`). `vp run check:mods` catches a module that touches one at load time; a mod isn't done without a pass.
- Keep Effect code in pure modules (no `herdr` or `gpui-*` imports) where it can be, so `tests/` can run it.

## Wrapping a promise API: the `use` pattern

Herdr's own API (`exec`, the `fs/promises` shim) returns promises. To call it from Effect code, give the service one `use` method: it takes a callback that gets the API and returns a promise, and turns that promise into an `Effect` with a tagged error. Every call site gets the same error handling, and nothing calls the API outside Effect.

For one or two calls, `Effect.tryPromise` at each call site is enough. Reach for `use` when the code makes many different calls.

Split it across two files, so `tests/` can load the logic without `herdr` (which exists only inside the app):

```ts
// src/shell.ts: pure. `import type` only, erased at build.
import { Context, Data, Effect } from "effect";
import type * as herdr from "herdr";

export type Herdr = typeof herdr;

export class ShellError extends Data.TaggedError("ShellError")<{ readonly cause: unknown }> {}

export class Shell extends Context.Service<
  Shell,
  { readonly use: <A>(fn: (api: Herdr) => Promise<A>) => Effect.Effect<A, ShellError> }
>()("<mod>/Shell") {}

// No `signal` parameter: Herdr has no AbortController.
export const shellUse =
  (api: Herdr) =>
  <A>(fn: (api: Herdr) => Promise<A>): Effect.Effect<A, ShellError> =>
    Effect.tryPromise({ try: () => fn(api), catch: (cause) => new ShellError({ cause }) });

export const gitBranch = Effect.fn("gitBranch")(function* (cwd: string) {
  const shell = yield* Shell;
  const result = yield* shell.use((api) => api.exec("git", ["branch", "--show-current"], { cwd }));
  return result.stdout.trim();
});
```

```ts
// src/main.ts: the shell. The only file that imports herdr's real module.
import { Effect, Layer } from "effect";
import * as herdr from "herdr";
import { gitBranch, Shell, shellUse } from "./shell.ts";

const ShellLive = Layer.succeed(Shell, { use: shellUse(herdr) });
// later, inside cx.spawn: await Effect.runPromise(gitBranch(cwd).pipe(Effect.provide(ShellLive)))
```

- **In tests**, build the layer from a fake: `Layer.succeed(Shell, { use: shellUse(fake) })`, where `fake` has only the functions the code calls (cast with a comment saying so). A fake that rejects proves the `ShellError` path.
- **Not the same as `Shell.use`.** Every v4 service class also has a built-in static `Shell.use((shell) => ...)` that fetches the service. The instance method `shell.use(...)` here is ours. Both work; prefer `yield* Shell` so the two don't blur.
- **Add typed helpers beside `use`** (`readFile`, `branch`) for calls made often; keep `use` for the rest.
- Use `Data.TaggedError`, not `Schema.TaggedError`, unless the mod already bundles `Schema`. Name the layers `layer` or `<Name>Live`, not v3's `Default`.
