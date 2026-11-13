// Stand-in for Herdr's sidebar: only the space menu call and the space row's name, which
// the wrapper patches.
const openOverlay = (spec) => spec;

// A stand-in for gpui's elements: every style call returns the element, and `child` and
// `children` keep what it holds, so a test can read the texts a row draws.
const div = () => {
  const kids = [];
  const el = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === "kids"
          ? kids
          : key === "child"
            ? (kid) => (kids.push(kid), el)
            : key === "children"
              ? (more) => (kids.push(...more), el)
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
    .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(w.name))
    .child(div().flex_1());
