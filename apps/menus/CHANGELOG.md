# menus

## 0.1.0

### Minor Changes

- [#17](https://github.com/iangregsondev/herdr-mods/pull/17) [`5062986`](https://github.com/iangregsondev/herdr-mods/commit/50629868db2f2a7cd9fcac5263bbff3c45bd42eb) Thanks [@iangregsondev](https://github.com/iangregsondev)! - First version of menus (`iangregsondev-menus`): Herdr's own tab bar, sidebar, "+" menu and space right-click menu, with worktrunk items added. "Worktree (wt)…" in the "+" menu and a space's menu opens worktrunk's New or open worktree dialog; "Merge into main (wt)…" and "Remove worktree (wt)…" on a linked worktree's space run worktrunk's merge or remove after a confirm. The items hand their work to the worktrunk panel, showing it first when it is hidden. If Herdr's code can't be loaded, you get Herdr's own menus and a toast saying why.

- [#50](https://github.com/iangregsondev/herdr-mods/pull/50) [`e567849`](https://github.com/iangregsondev/herdr-mods/commit/e567849a9a52833e996a11b2ab195b7f36f518a5) Thanks [@iangregsondev](https://github.com/iangregsondev)! - A space's menu now has "New worktree (wt)…" and "Open worktree (wt)…" in place of "Worktree (wt)…", and they, "Merge into main (wt)…" and "Remove worktree (wt)…" work for spaces on any machine, so "No worktree to act on" no longer appears for a space on another machine. Each space row in the sidebar shows a small group label (Work, Personal) from the worktrunk panel. If Herdr's sidebar changes so the label can't be added, you get Herdr's own sidebar and a toast saying why.
