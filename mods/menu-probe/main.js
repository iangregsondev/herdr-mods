import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, closeOverlay, nextCommand, notify, openOverlay, props, readTextFile, spaces, theme } from "herdr";
import * as fs from "fs/promises";

// src/main.ts
const SELF = "menu-probe";
const bases = {};
const describe = (e) => e instanceof Error ? `${e.name}: ${e.message}` : String(e);
async function tryImport(spec) {
	try {
		const d = (await import(
			/* @vite-ignore */
			spec
))?.default;
		return {
			name: `import("${spec}")`,
			ok: true,
			detail: typeof d === "function" ? `default: class ${d.name}` : `default: ${JSON.stringify(d)}`
		};
	} catch (e) {
		return {
			name: `import("${spec}")`,
			ok: false,
			detail: describe(e)
		};
	}
}
function trySync(name, f) {
	try {
		return {
			name,
			ok: true,
			detail: String(f())
		};
	} catch (e) {
		return {
			name,
			ok: false,
			detail: describe(e)
		};
	}
}
async function runtimeCopy(mod) {
	const name = `runtime copy of ${mod}`;
	try {
		const home = appHome();
		const source = await fs.readFile(`${home}/mods/${mod}/main.js`, "utf8");
		const target = `${home}/mods/${SELF}/.herdr-${mod}.js`;
		if ((await fs.exists(target) ? await fs.readFile(target, "utf8") : null) !== source) await fs.writeFile(target, source);
		const d = (await import(
			/* @vite-ignore */
			`./.herdr-${mod}.js`
))?.default;
		if (typeof d !== "function") return {
			name,
			ok: false,
			detail: `default is ${typeof d}`
		};
		bases[mod] = d;
		const methods = Object.getOwnPropertyNames(d.prototype).join(", ");
		return {
			name,
			ok: true,
			detail: `${source.length} bytes, class ${d.name} { ${methods} }`
		};
	} catch (e) {
		return {
			name,
			ok: false,
			detail: describe(e)
		};
	}
}
async function runProbes() {
	const home = appHome();
	const out = [];
	out.push(await tryImport("./control.js"));
	for (const spec of [
		"../new-menu/main.js",
		"mods/new-menu/main.js",
		`${home}/mods/new-menu/main.js`,
		`file://${home}/mods/new-menu/main.js`,
		"new-menu",
		"data:text/javascript,export default 7"
	]) out.push(await tryImport(spec));
	out.push(trySync("eval", () => (0, eval)("1 + 1")));
	out.push(trySync("new Function", () => new Function("return 2")()));
	try {
		const text = await readTextFile(`${home}/mods/new-menu/main.js`);
		out.push({
			name: "readTextFile(new-menu)",
			ok: text !== null,
			detail: `${text?.length ?? 0} bytes`
		});
	} catch (e) {
		out.push({
			name: "readTextFile(new-menu)",
			ok: false,
			detail: describe(e)
		});
	}
	out.push(await runtimeCopy("new-menu"));
	out.push(await runtimeCopy("menu"));
	return out;
}
function openNew() {
	openOverlay({
		mod: SELF,
		kind: "popup",
		width: 250,
		height: 560,
		props: { role: "new-menu" }
	});
}
function openSpaceMenu() {
	const space = spaces().find((s) => s.active);
	openOverlay({
		mod: SELF,
		kind: "popup",
		width: 200,
		height: 300,
		props: {
			role: "menu",
			tab: "space",
			target: { id: space?.id }
		}
	});
}
var MenuProbe = class extends View {
	init(p, cx) {
		const role = props()?.role;
		if (role === "new-menu" || role === "menu") {
			this.role = role;
			const Base = bases[role];
			if (!Base) {
				this.missing = true;
				return;
			}
			for (const k of Object.getOwnPropertyNames(Base.prototype)) if (![
				"constructor",
				"init",
				"render"
			].includes(k)) this[k] = Base.prototype[k].bind(this);
			Base.prototype.init?.call(this, p, cx);
			return;
		}
		this.probes = [];
		cx.spawn(async (cx) => {
			this.probes = await runProbes();
			cx.notify();
		});
		cx.spawn(async () => {
			for (;;) {
				const c = await nextCommand();
				if (c === "open-new") openNew();
				if (c === "open-menu") openSpaceMenu();
			}
		});
	}
	render(cx) {
		const t = theme();
		if (this.role) return this.renderWrapped(cx, t);
		return v_flex().size_full().p(10).gap(6).bg(t.surface).text_color(t.foreground).text_size(12).overflow_y_scrollbar().child(div().font_semibold().child("Load another mod's code?")).children(this.probes.map((r, i) => v_flex().id(`probe-${i}`).child(h_flex().gap(6).child(div().text_color(r.ok ? t.done : t.blocked).child(r.ok ? "OK" : "NO")).child(r.name)).child(div().text_size(11).text_color(t.muted).child(r.detail)))).child(h_flex().gap(8).pt(6).child(this.button("open-new", "Open wrapped + menu", t, openNew)).child(this.button("open-menu", "Open wrapped space menu", t, openSpaceMenu)));
	}
	button(id, label, t, action) {
		return div().id(id).px(8).py(4).rounded(6).bg(t.raised).hover((s) => s.bg(t.hover)).on_click(action).child(label);
	}
	renderWrapped(cx, t) {
		const Base = bases[this.role];
		if (this.missing || !Base) return div().p(10).bg(t.popover).child("Herdr's menu not loaded yet: open the panel first.");
		const say = () => {
			closeOverlay(props()?.overlay);
			notify({
				title: "menu-probe",
				body: `Wrapped ${this.role} item clicked`,
				level: "info"
			});
		};
		const el = Base.prototype.render.call(this, cx);
		if (this.role === "new-menu") {
			const row = this.row("probe-item", div().w(14).child("W"), "Worktrunk: new worktree (probe)", say);
			return el.child(div().h(1).mx(4).my(5).bg(t.border)).child(row).h(532);
		}
		return el.child(h_flex().id("probe-item").h(31).px(8).gap(9).rounded(7).items_center().hover((s) => s.bg(t.hover)).on_click(say).child(div().w(14).child("W")).child("Worktrunk item (probe)"));
	}
};

export { MenuProbe as default };