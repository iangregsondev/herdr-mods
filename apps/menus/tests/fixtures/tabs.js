// Stand-in for Herdr's tab bar: only the calls the wrapper patches or must leave alone.
const openOverlay = (spec) => spec;

export const plus = () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });

export const tabMenu = (id, space) =>
  openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id, space } } });
