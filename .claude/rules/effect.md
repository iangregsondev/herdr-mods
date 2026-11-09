---
paths:
  - "apps/*/src/**"
  - "packages/*/src/**"
---

# Effect in a Herdr mod

Read `node_modules/effect/AGENTS.md` before writing Effect code (CLAUDE.md, "Effect"). These are the limits of Herdr's runtime on top of it:

- **No clock-based operators.** `setTimeout` exists in Herdr but throws ("use cx.timer.after"), so `Effect.sleep`, `Schedule`, `Effect.retry` with a delay, `Effect.timeout` and anything else that waits on time fail at run time. Time things with `cx.timer` and keep Effect for the logic.
- **No `AbortController` or `AbortSignal`.** Effect builds an `AbortController` whenever a promise or callback constructor's function declares a `signal` parameter (`Effect.tryPromise({ try: (signal) => ... })`, `Effect.promise((signal) => ...)`, `Effect.callback((resume, signal) => ...)`), and that fails with a `ReferenceError`. Leave the parameter out: `try: () => ...`.
- **Run effects at the edge, and handle their failures there.** Inside the `View`, run with `Effect.runSync` (pure work) or `Effect.runPromise` inside `cx.spawn`. Never keep a `cx` inside an effect for later. Turn every failure into view state before running: `Effect.catchTags` into a value the view renders, or `Effect.runPromiseExit` and render the failed `Exit`. A rejected `runPromise` in `cx.spawn` is reported by Herdr but never reaches the view, so the user sees nothing.
- **Each mod bundles its own Effect.** Herdr refuses imports outside a mod's folder, so mods can't share one copy. Import named modules from `"effect"` and let the bundler drop the rest: core costs about 100 KB of `main.js`, `Schema` about 260 KB. Use `Schema` only to parse data from outside (`exec` output, files, `fetch`).
- **Some modules need other globals Herdr lacks** (`TextEncoder`, `structuredClone`). `vp run check:mods` catches a module that touches one at load time; a mod isn't done without a pass.
- Keep Effect code in pure modules (no `herdr` or `gpui-*` imports) where it can be, so `tests/` can run it.

## Wrapping a promise API: the `use` pattern

Herdr's own API (`exec`, the `fs/promises` shim) returns promises. To call it from Effect code, give the service one `use` method: it takes a callback that gets the API and returns a promise, and turns that promise into an `Effect`. Nothing calls the API outside Effect.

`use` is the transport only: a rejected promise becomes `ShellError`, and nothing else is checked. A promise that resolves can still mean failure (`exec` resolves with a non-zero `code` when the command fails). Typed helpers beside `use` read the result and map exit codes and known failures to their own tagged errors, one per failure mode. Call the API through a helper wherever one exists.

For one or two calls, `Effect.tryPromise` at each call site is enough. Reach for `use` when the code makes many different calls.

Split it across two files, so `tests/` can load the logic without `herdr` (which exists only inside the app):

```ts
// src/shell.ts: pure. `import type` only, erased at build.
import { Context, Data, Effect, Layer } from "effect";
import type * as herdr from "herdr";

export type Herdr = typeof herdr;

// The promise rejected: the command couldn't start (not installed, no such folder).
export class ShellError extends Data.TaggedError("ShellError")<{ readonly cause: unknown }> {}

// The command ran and exited non-zero.
export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly code: number;
  readonly stderr: string;
}> {}

export class Shell extends Context.Service<
  Shell,
  {
    readonly use: <A>(fn: (api: Herdr) => Promise<A>) => Effect.Effect<A, ShellError>;
    readonly exec: (
      command: string,
      args: ReadonlyArray<string>,
      options?: { readonly cwd?: string },
    ) => Effect.Effect<herdr.ExecResult, ShellError | CommandFailed>;
  }
>()("<mod>/Shell") {
  static readonly layer = (api: Herdr) => {
    // No `signal` parameter: Herdr has no AbortController.
    const use = <A>(fn: (api: Herdr) => Promise<A>): Effect.Effect<A, ShellError> =>
      Effect.tryPromise({ try: () => fn(api), catch: (cause) => new ShellError({ cause }) });

    const exec = Effect.fn("Shell.exec")(function* (
      command: string,
      args: ReadonlyArray<string>,
      options?: { readonly cwd?: string },
    ) {
      const result = yield* use((api) => api.exec(command, [...args], options));
      if (result.code !== 0) {
        return yield* new CommandFailed({ code: result.code, stderr: result.stderr });
      }
      return result;
    });

    return Layer.succeed(Shell, Shell.of({ use, exec }));
  };
}

export const gitBranch = Effect.fn("gitBranch")(function* (cwd: string) {
  const shell = yield* Shell;
  const result = yield* shell.exec("git", ["branch", "--show-current"], { cwd });
  return result.stdout.trim();
});
```

```ts
// src/main.ts: the shell. The only file that imports herdr's real module.
import { Effect } from "effect";
import * as herdr from "herdr";
import { gitBranch, Shell } from "./shell.ts";

// Run inside cx.spawn. Every failure becomes a label the view renders.
const branchLabel = (cwd: string) =>
  Effect.runPromise(
    gitBranch(cwd).pipe(
      Effect.catchTags({
        CommandFailed: (error) => Effect.succeed(`git failed (${error.code})`),
        ShellError: () => Effect.succeed("git not found"),
      }),
      Effect.provide(Shell.layer(herdr)),
    ),
  );
```

- **In tests**, build the layer from a fake: `Shell.layer(fake)`, where `fake` has only the functions the code calls (cast with a comment saying so). A fake `exec` that resolves `{ code: 128, stdout: "", stderr: "..." }` proves the `CommandFailed` path (`Effect.flip` yields it); one that rejects proves `ShellError`.
- **Not the same as `Shell.use`.** Every v4 service class also has a built-in static `Shell.use((shell) => ...)` that fetches the service. The instance method `shell.use(...)` here is ours. Both work; prefer `yield* Shell` so the two don't blur.
- **Add a typed helper beside `exec`** (`readFile`, `branch`) for each call made often, with its own tagged error for each way it fails; keep `use` for the rest.
- Use `Data.TaggedError`, not `Schema.TaggedError`, unless the mod already bundles `Schema`. Put the layer on the service as a static `layer` (a function of the API when it needs one, as here), not v3's `Default`.
