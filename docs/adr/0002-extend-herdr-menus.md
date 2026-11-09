# Worktree items in Herdr's menus come from extending Herdr's own menu mods

We need worktrunk items in Herdr's "+" menu and in a space's right-click menu. Herdr gives mods no way to add menu items. Both menus are fixed lists in Herdr's own `new-menu` and `menu` mods, and the mods that open them (`tabs`, `spaces`) name them directly. So we extend Herdr's mods ourselves, in this order of preference:

1. **Wrap at runtime:** our mod loads Herdr's current menu code and adds items, so Herdr's new items arrive by themselves. This works only if a mod can import another mod's files.
2. **Sync and patch:** a script reads Herdr's current shipped files and writes our versions with our items added. It is re-run after Herdr updates and fails loudly when a patch point has moved.
3. **Plain copy and edit,** if neither of the above works. This never gets Herdr's updates.

A test ticket decides between 1 and 2. Until then, the panel's header button and a `keys.json` shortcut give the same actions. If Herdr ever adds a way for mods to add menu items, we switch to it and drop all of this.
