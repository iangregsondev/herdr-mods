---
"worktrunk": minor
---

pr: #50

Worktrunk now works across machines. A group folder can name the machine it is on (`~` means that machine's home), and Settings can add one on another machine after checking the path there. Every read and job (scan, `wt list`, CI, Merge, Remove, Clean up, Create) runs on the repo's own machine through its login shell, with one batched read per machine per refresh; a machine still connecting or unreachable gets its own line, and this machine's repos never wait on it. Spaces on every machine count as open, Current follows a space on another machine, and "Open in a new space" opens on the worktree's machine. Two dropdowns pick the machine and the group, and repos show their machine when more than one is in view. A fresh worktree with nothing done in it shows as New, not under Clean up. Current is first in the view picker, the panel is titled "Worktrunk", failures that used to be silent now show as a toast or banner, and the old `worktrunk.json` is removed once imported.
