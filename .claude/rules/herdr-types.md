---
paths:
  - "apps/**/src/**"
  - "packages/**/src/**"
  - "tsconfig.json"
  - "herdr-env.d.ts"
---

# Herdr types

If `.herdr-types/` is missing, or `vp check` reports "Cannot find module 'herdr'" or "'gpui-kit'", run `vp run types`. It puts the app's type files there from the dev target: links for `local`, copies from the Herdr host for `remote`. Never commit them, and never copy them in by hand. If it warns that the Herdr host is unreachable, tell the person. Details: `docs/types.md`.
