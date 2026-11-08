---
paths:
  - "apps/**/src/**"
  - "packages/**/src/**"
  - "tsconfig.json"
  - "herdr-env.d.ts"
---

# Herdr types

If `.herdr-types/` is missing, or `vp check` reports "Cannot find module 'herdr'" or "'gpui-kit'", run `vp run types`. It links the app's type files; never copy or commit them. Details: `docs/types.md`.
