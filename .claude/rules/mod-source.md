---
paths:
  - "apps/**/src/**"
---

# Writing mod code

Mods run in the Herdr app's embedded JS (gpui-kit), not Node. Read `~/.config/herdr-app/AGENTS.md` ("Mods" and "The `herdr` module") before writing. The rules that matter most:

- `main.ts` default-exports a class extending `View`: `init(props, cx)` once, `render(cx)` on every change.
- Never keep a `cx` for later: every callback gets its own.
- Never call `setTimeout` or `setInterval` (they exist but throw), and no top-level `await`. Use `cx.timer` and `cx.spawn`.
- No Node APIs or DOM. Run programs with `exec` from `herdr`. Only `fs/promises`, `path`, `buffer`, `url` and `crypto` shims exist.
- Animate with `.frames`, `.spin`, `.loop` and `.transition`, never a timer calling `cx.notify()`.
- Colours come from `theme()`, so the mod follows the user's theme.
- Keep pure logic in modules that don't import `herdr` or `gpui-*`, so `tests/` can cover it.
