---
paths:
  - "apps/**/src/**"
  - "packages/**/src/**"
---

# Effect in a Herdr mod

Read `node_modules/effect/AGENTS.md` before writing Effect code (CLAUDE.md, "Effect"). These are the limits of Herdr's runtime on top of it:

- **No clock-based operators.** Herdr has no `setTimeout`, so `Effect.sleep`, `Schedule`, `Effect.retry` with a delay, `Effect.timeout` and anything else that waits on time fail at run time. Time things with `cx.timer` and keep Effect for the logic.
- **Run effects at the edge.** Inside the `View`, run with `Effect.runSync` (pure work) or `Effect.runPromise` inside `cx.spawn`. Never keep a `cx` inside an effect for later.
- **Each mod bundles its own Effect.** Herdr refuses imports outside a mod's folder, so mods can't share one copy. Import named modules from `"effect"` and let the bundler drop the rest: core costs about 100 KB of `main.js`, `Schema` about 260 KB. Use `Schema` only to parse data from outside (`exec` output, files, `fetch`).
- **Some modules need globals Herdr lacks** (`TextEncoder`, for one). `vp run check:mods` catches a module that touches one at load time; a mod isn't done without a pass.
- Keep Effect code in pure modules (no `herdr` or `gpui-*` imports) where it can be, so `tests/` can run it.
