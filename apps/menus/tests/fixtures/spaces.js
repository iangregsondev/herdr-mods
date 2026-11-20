// Stand-in for Herdr's sidebar: only the space menu call, the space row's name and the
// row list of its ordering, which the wrapper patches. Each patched line is copied as-is from Herdr's installed
// `mods/spaces/main.js` (Herdr app 0.1.16), so a patch point that fits here fits Herdr.
const SIDE_MIN = 48;

const openOverlay = (spec) => spec;

// A stand-in for gpui's elements: every style call returns the element, `child` and
// `children` keep what it holds, and `text_color` and `tooltip` keep their values, so a
// test can read the texts a row draws, their colours and their tooltips. An `svg` is an
// element that also keeps its file's path.
const div = (path = null) => {
  const kids = [];
  const kept = { color: null, tip: null, path };
  const el = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === "kids"
          ? kids
          : key in kept
            ? kept[key]
            : key === "child"
              ? (kid) => (kids.push(kid), el)
              : key === "children"
                ? (more) => (kids.push(...more), el)
                : key === "text_color"
                  ? (color) => ((kept.color = color), el)
                  : key === "tooltip"
                    ? (tip) => ((kept.tip = tip), el)
                    : () => el,
    },
  );
  return el;
};
const h_flex = () => div();
// Only the patched copy's pills call it, as Herdr's sidebar imports gpui-kit's `svg`.
// oxlint-disable-next-line no-unused-vars
const svg = (path) => div(path);

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
