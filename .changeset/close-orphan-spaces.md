---
"worktrunk": minor
---

The panel now closes spaces left on worktrees removed outside it (`wt remove` or `wt merge` in a terminal, an agent's cleanup) when only shells run in them, checked on the space's own machine. A space where anything else runs (an agent, an editor) stays open, and a toast offers to close it once: click it and Herdr asks before closing.
