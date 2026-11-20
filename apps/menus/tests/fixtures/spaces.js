// Stand-in for Herdr's sidebar: only the space menu call, the space row's name and the
// row list of its ordering, which the wrapper patches. Each patched line is copied as-is from Herdr's installed
// `mods/spaces/main.js` (Herdr app 0.1.16), so a patch point that fits here fits Herdr.
const SIDE_MIN = 48;

const openOverlay = (spec) => spec;

// A stand-in for gpui's elements: every style call returns the element, `child` and
// `children` keep what it holds, and `text_color` keeps its colour, so a test can read
// the texts a row draws and their colours.
const div = () => {
  const kids = [];
  const look = { color: null };
  const el = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === "kids"
          ? kids
          : key === "color"
            ? look.color
            : key === "child"
              ? (kid) => (kids.push(kid), el)
              : key === "children"
                ? (more) => (kids.push(...more), el)
                : key === "text_color"
                  ? (color) => ((look.color = color), el)
                  : () => el,
    },
  );
  return el;
};
const h_flex = div;

export const spaceMenu = (w) =>
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });

export const row = (w, t) =>
  h_flex()
          .gap(9)
          .items_center()
          .child(div().flex_initial().min_w(SIDE_MIN).truncate().text_color(t.foreground).child(w.name))
          .child(div().flex_1());

// Herdr's key for a space's place: its machine and its folder (Herdr's place is the first
// terminal's live folder; the stand-in's is the space's folder).
const where = (s, _ps) => JSON.stringify([s.machine ?? null, s.folder]);

// Herdr's sidebar keeps each place's git entry in `this.git`; its `ordered()` starts from
// this row list, then nests and reorders the rows by their entries.
export class Sidebar {
  constructor(git) {
    this.git = git;
  }

  rows(sp, ps) {
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    return list;
  }
}
