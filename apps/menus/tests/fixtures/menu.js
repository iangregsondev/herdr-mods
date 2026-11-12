// Stand-in for Herdr's context menu: an `items(p, git)` list shaped like Herdr's, with
// made-up labels, and a class whose `choose` reads it.
function items(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "tab":
      return [["Rename tab", "tab.rename", { id: tg.id }], ["Close", "tab.close", { id: tg.id }]];
    case "space":
      return [
        ["Rename", "space.rename", { id: tg.id }],
        ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }]] : []),
        ["Close", "space.close", { id: tg.id }],
      ];
    default:
      return [["New space", "space.new", {}]];
  }
}

export default class Menu {
  choose(i) {
    return items(this.p, this.git)[i];
  }
}
