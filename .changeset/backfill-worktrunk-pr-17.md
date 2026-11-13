---
"worktrunk": minor
---

pr: #17

First version of worktrunk (`iangregsondev-worktrunk`): a panel on the right that lists your git repos and their worktrunk (`wt`) worktrees, grouped into Merged, In progress and Conflicts with main. Views for Current, Repos, Clean up, Active, Conflicts and Open, with group chips and search. Row and repo menus merge, remove and clean up worktrees as visible jobs, one at a time. A New or open worktree dialog, a Settings dialog, and five commands you can bind in `keys.json`. Failures (a repo scan, a branch list, an unreadable settings file) show as a banner or toast with the reason instead of an empty list. The menus mod's items reach this panel through a shared mailbox.
