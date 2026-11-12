# Build where the repo lives, sync to the Herdr host

The repo and its agents can live on a different machine from the Herdr app. When `herdr-dev.json` sets the dev target to `remote`, the dev loop builds on the repo's machine and copies each rebuild into the Herdr host's mods folder with rsync over SSH. Layout edits, `herdr-app` commands and Herdr's type files also go over SSH. The Herdr host needs only sshd, rsync and the Herdr app, and runs no repo code.

## Considered options

- **Move the repo to the Herdr host.** Rejected: that machine is a laptop, and agent sessions stop when it sleeps.
- **Build, git push, pull on the Herdr host.** Rejected: one push per edit is too much churn for a loop that should reload on save.
- **A file-sync daemon (e.g. Mutagen).** Rejected: the watch rebuild already says when to copy, so a one-shot rsync after each build is simpler and has nothing to keep running.

## Consequences

- rsync runs without `--delete`, because Herdr writes its own files into a mod's folder.
- Herdr docks a mod only the first time it sees it, so the slot step runs over SSH too.
- The config holds a host and user name, so it is git-ignored in this public repo, and only an example is committed.
