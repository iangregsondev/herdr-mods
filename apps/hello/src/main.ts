// Example mod: a panel that says how many spaces are open.
import { View } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, theme } from "herdr";
import { greeting } from "./greeting.ts";

type Colors = Record<string, `#${string}`>;

export default class Hello extends View {
  render() {
    // theme() is typed as plain strings, but the style methods want hex colours.
    const t = theme() as Colors;
    return v_flex()
      .size_full()
      .p(10)
      .bg(t.surface)
      .text_color(t.foreground)
      .text_size(13)
      .child(greeting(spaces().length));
  }
}
