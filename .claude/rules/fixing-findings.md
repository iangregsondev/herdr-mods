---
paths:
  - "apps/**"
  - "packages/**"
  - "scripts/**"
---

# Fixing review findings

When a finding comes back from any review (`/code-review`, `/deep-review`, PR comments), fix the cause, not the instance.

- **Restate the finding as an invariant** before changing code: a rule that must always hold ("a slot id is unique in a layout"), not the one case that broke. Fix every place that breaks it, not only the line cited.
- **Pin the invariant with a test** where the code is testable (`.claude/rules/tests.md`): it fails before the fix and passes after.
- **Comments explain the code as it is now.** Never cite a reviewer, a review, a PR or an issue ("per review", "fixes #12", "as asked"). That history lives in the commit and the PR. Write why the code holds the invariant instead.
- **No leftover markers.** No `TODO`, `FIXME`, `XXX` or `HACK`: do the work, or open an issue and leave the code clean.

`vp check` backs up the last two with oxlint's `no-warning-comments` (terms in `vite.config.ts`). It matches whole words anywhere in a comment, so a comment that needs one of those words (say, explaining a "review" feature) gets one `oxlint-disable-next-line no-warning-comments` with the reason.
