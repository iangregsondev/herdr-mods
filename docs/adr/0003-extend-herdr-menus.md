# Worktree items in Herdr's menus come from extending Herdr's own menu mods

We need worktrunk items in Herdr's "+" menu and in a space's right-click menu. Herdr gives mods no way to add menu items. Both menus are fixed lists in Herdr's own `new-menu` and `menu` mods, and the mods that open them (`tabs`, `spaces`) name them directly. So we extend Herdr's mods ourselves, in this order of preference:

1. **Wrap at runtime:** our mod loads Herdr's current menu code and adds items, so Herdr's new items arrive by themselves. This works only if a mod can import another mod's files.
2. **Sync and patch:** a script reads Herdr's current shipped files and writes our versions with our items added. It is re-run after Herdr updates and fails loudly when a patch point has moved.
3. **Plain copy and edit,** if neither of the above works. This never gets Herdr's updates.

If Herdr ever adds a way for mods to add menu items, we switch to it and drop all of this. Until our menus are wired in, the panel's header button and a `keys.json` shortcut give the same actions.

## Decision: wrap at runtime, through a copy in our own folder

A prototype (branch `prototype/menu-import`, mod `menu-probe`) tried every way of loading another mod's code in the running app:

| Tried                                                                                                       | Result                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `import("./control.js")`, a file in our own folder                                                          | works                                                                                               |
| `import()` of Herdr's `new-menu` by relative path, app-home path, absolute path, `file://` URL or bare name | refused: "resolves outside the application directory", or "may otherwise import only its own files" |
| `import("data:...")`                                                                                        | refused: cannot resolve                                                                             |
| `eval`, `new Function`                                                                                      | disabled: "the shell sandbox withholds dynamic code"                                                |
| reading Herdr's `mods/<mod>/main.js` (`fs/promises`, `readTextFile`)                                        | works                                                                                               |
| writing that text unchanged to `.herdr-<mod>.js` in our own mod folder, then `import("./.herdr-<mod>.js")`  | works: the default export is Herdr's class                                                          |

So a mod cannot import another mod directly, but it can copy another mod's file into its own folder at run time and import the copy. With the copy loaded, our popup reused Herdr's class: it copied the class's helper methods onto itself, ran Herdr's `init` and `render`, and appended one item to the element `render` returned. Both menus showed every Herdr item, live (installed agents, the git check that adds the worktree items), with ours at the bottom. Herdr's file is never in this repo: the copy is made on the user's machine each time our mod loads, and refreshed when Herdr's file changes, so Herdr's new items arrive by themselves.

`tabs` and `spaces` cannot be pointed at our menus. They call `openOverlay({ mod: "new-menu", ... })` and `openOverlay({ mod: "menu", ... })` with the names written in; only the terminal right-click menu has a layout setting (`terminal_menu`). To get our menus from the "+" button and a space's right-click, we wrap `tabs` and `spaces` the same way, but patch the copy's text before importing it: replace the overlay's mod name with our mod id. That is sync and patch, done at run time on the user's machine. Each patch must match exactly once; when it doesn't, our wrapper uses Herdr's unpatched copy and reports it, rather than guessing. A layout uses our wrappers in place of `tabs` and `spaces`.

## Mechanics

- **Import path:** read `<appHome()>/mods/<mod>/main.js` with `fs/promises`, write it to `<appHome()>/mods/<our id>/.herdr-<mod>.js` when the text differs, then `import("./.herdr-<mod>.js")` with a variable specifier so the bundler leaves it alone. The default export is Herdr's class.
- **Our menus are our own mod opened as a popup:** `openOverlay({ mod: "<our id>", kind: "popup", props: { role: "new-menu" | "menu", ...Herdr's props } })`. In that role our class copies the Herdr class's prototype methods (other than `constructor`, `init`, `render`) onto itself, calls Herdr's `init`, then Herdr's `render`, and adds our items to the result. `new-menu`'s `row()` gives our items Herdr's look; its root has a fixed height that must be raised to fit them.
- **How the menus are opened today:** `tabs` opens `openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })` from "+", and `menu` with props `{ tab: "tab", target: { id, space } }` on a tab's right-click; `spaces` opens `openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id } } })`.
- **Patch points:** in the copies of `tabs` and `spaces`, the `mod: "new-menu"` and `mod: "menu"` of those calls (space menu only), each matched exactly once, become our mod id with `role` added to the props and a height that fits our items. For keyboard support in the space menu, our items go into the copy of `menu`'s `items()` before its `["Close", "space.close", ...]` entry.

## Consequences

- Our menus depend on the shape of Herdr's code: a class whose `render` returns an element we can add children to, helper methods on the prototype, and the exact `openOverlay` calls we patch. A Herdr update can break this; the wrapper must then fall back to Herdr's own mod and say so.
- Items appended after `render` work with the mouse only: Herdr's keyboard handling in `menu` walks its own item list. Keyboard support needs a text patch of that list too.
- The copies are hidden files (`.herdr-<mod>.js`), so writing them does not make Herdr reload our mod. They live in the installed mod folder next to our files.
- The copy loads asynchronously, so the class is ready only after our mod has loaded once. A wrapper must render a placeholder until it is, and a popup opened before then must load the copy itself.
- Built as one mod, `menus` (`iangregsondev-menus`), playing four roles from its props: `tabs` and `spaces` (layout blocks) and `new-menu` and `menu` (the popups they open). `herdr:sync` swaps Herdr's `tabs` and `spaces` blocks for it, only while it is installed. Its items reach the worktrunk panel through the panel's mailbox (`packages/worktrunk-mailbox`), which also holds the `Files` service both mods read and write files through.
- Herdr's `init` must run in the copy's own `init`: started from a task, the tasks it starts never answer (the space menu's git check). The tab bar and sidebar load the menus' copies early; a menu opened before that closes and opens again once loaded. Mounting Herdr's view as a nested entity (`cx.new`) failed ("this Entity has been released"), so the copy's methods are bound onto our instance as the prototype did.
- Our space-menu items sit inside Herdr's item list (a patch of `items()`), so Herdr's ↑/↓/Enter reach them too.
