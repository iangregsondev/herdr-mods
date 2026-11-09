# Fixing review findings

Always loaded: a finding arrives before you touch any file. It applies to findings from any review (`/code-review`, `/deep-review`, PR comments), whichever files they touch.

## Turning a finding into a fix

- **Check it first.** Read the code the finding points at and confirm the claim holds; a review can be wrong or half right. Say what you confirmed, what you refuted, and any gap the suggested fix leaves open. Don't widen the change to close that gap without asking.
- **Restate it as an invariant** before changing code: a rule that must always hold ("a slot id is unique in a layout"), not the reviewer's sentence or the one case that broke. Fix every place that breaks it, not only the line cited.
- **One finding, one test-first cycle** where the code is testable (`.claude/rules/tests.md`): a test of the invariant that fails before the fix and passes after. A finding without a failing test is asserted, not fixed.
- **Never weaken a test to satisfy a finding.** If the fix can't pass the test as written, stop and say so (`.claude/rules/tests.md`).

## Where the history goes

- **Comments explain the code as it is now**, for a reader with only the file open. Never cite a reviewer, a review, a PR, an issue or a conversation ("per review", "fixes #12", "as discussed"). Write why the code holds the invariant.
- **Test names describe behaviour**, not where the test came from: "rejects a duplicate slot id", never "regression for review comment".
- **History lives in the commit and the PR.** The commit message may say what it addresses; the reply to the reviewer goes in the PR thread.
- **Never resolve a review thread.** The reviewer resolves it once they've seen the fix.
- **No leftover markers.** No `TODO`, `FIXME`, `XXX` or `HACK`: do the work, or open an issue and leave the code clean.

`vp check` backs up the comment rules with oxlint's `no-warning-comments` (terms in `vite.config.ts`). It matches anywhere in a comment, so a comment that truly needs one of those words (say, explaining a "review" feature) gets one `oxlint-disable-next-line no-warning-comments` with the reason.
