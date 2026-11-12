// Stand-in for Herdr's "+" menu: only the root's height, which the wrapper patches.
const v_flex = () => {
  const el = { min_h: () => el, w_full: () => el, h: (px) => ((el.height = px), el) };
  return el;
};

export const root = (choices) =>
  v_flex().min_h(0).w_full().h(Math.min(491, 167 + Math.max(1, choices.length) * 31)).height;
