import { View } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, theme } from "herdr";

// src/greeting.ts
function greeting(spaceCount) {
	if (spaceCount === 0) return "Hello! No spaces open.";
	return `Hello! ${spaceCount} space${spaceCount === 1 ? "" : "s"} open.`;
}

// src/main.ts
var Hello = class extends View {
	render() {
		const t = theme();
		return v_flex().size_full().p(10).bg(t.surface).text_color(t.foreground).text_size(13).child(greeting(spaces().length));
	}
};

export { Hello as default };