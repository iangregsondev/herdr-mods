---
paths:
  - "apps/*/tests/**"
  - "packages/*/tests/**"
---

# Tests

- Tests live in `<package>/tests/*.test.ts`, beside `src/`, and import from `vite-plus/test`.
- `herdr` and `gpui-kit` exist only inside the Herdr app, so tests import pure modules only. Gate the UI with `vp run check:mods` after `vp run -r build`.
- Run with `vp run -r test`, or `vp -C apps/<name> test` for one package.
