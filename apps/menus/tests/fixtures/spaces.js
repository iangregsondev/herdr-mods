// Stand-in for Herdr's sidebar: only the space menu call the wrapper patches.
const openOverlay = (spec) => spec;

export const spaceMenu = (w) =>
  openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
