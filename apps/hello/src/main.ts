// Example mod: a panel that says how many spaces are open, and names itself by its mod id.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, theme } from "herdr";
import { greeting } from "./greeting.ts";

type Colors = Record<string, `#${string}`>;

export default class Hello extends View {
  render() {
    // theme() is typed as plain strings, but the style methods want hex colours.
    const t = theme() as Colors;
    return (
      v_flex()
        .size_full()
        .p(10)
        .bg(t.surface)
        .text_color(t.foreground)
        .text_size(13)
        .gap(4)
        .child(greeting(spaces().length))
        // __MOD_ID__ is this mod's installed id, set by the build (mod-pack.ts).
        .child(div().text_size(11).text_color(t.muted).child(__MOD_ID__))
    );
  }
}
