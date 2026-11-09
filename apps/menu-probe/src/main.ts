// Throwaway prototype. Answers: can a mod load Herdr's own `new-menu` and `menu`
// mods at run time, and wrap them to add items?
//
// The panel runs each way of loading another mod's code and lists the result.
// Its buttons open this same mod as a popup in a "new-menu" or "menu" role: the
// popup borrows Herdr's class methods (init, render, row) and appends one item.
//
// No Herdr code lives in this repo. The "runtime copy" probe reads Herdr's
// installed file and writes it, unchanged, to a hidden file in this mod's own
// folder in the Herdr app, then imports that.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import {
  appHome,
  closeOverlay,
  nextCommand,
  notify,
  openOverlay,
  props,
  readTextFile,
  spaces,
  theme,
} from "herdr";
import * as fs from "fs/promises";

const SELF = "menu-probe";

type Colors = Record<string, `#${string}`>;
type Probe = { name: string; ok: boolean; detail: string };
// oxlint-disable-next-line typescript/no-explicit-any -- Herdr's mods are untyped JS classes
type AnyClass = any;

// Shared by every copy of this module: the panel fills it, popups read it.
const bases: Record<string, AnyClass> = {};

const describe = (e: unknown): string =>
  e instanceof Error ? `${e.name}: ${e.message}` : String(e);

async function tryImport(spec: string): Promise<Probe> {
  try {
    const m = await import(/* @vite-ignore */ spec);
    const d = m?.default;
    return {
      name: `import("${spec}")`,
      ok: true,
      detail:
        typeof d === "function" ? `default: class ${d.name}` : `default: ${JSON.stringify(d)}`,
    };
  } catch (e) {
    return { name: `import("${spec}")`, ok: false, detail: describe(e) };
  }
}

function trySync(name: string, f: () => unknown): Probe {
  try {
    return { name, ok: true, detail: String(f()) };
  } catch (e) {
    return { name, ok: false, detail: describe(e) };
  }
}

// Copies Herdr's installed `<mod>/main.js` to `.herdr-<mod>.js` in this mod's
// folder (hidden, so Herdr doesn't reload us on write), then imports it.
async function runtimeCopy(mod: string): Promise<Probe> {
  const name = `runtime copy of ${mod}`;
  try {
    const home = appHome();
    const source = await fs.readFile(`${home}/mods/${mod}/main.js`, "utf8");
    const target = `${home}/mods/${SELF}/.herdr-${mod}.js`;
    const current = (await fs.exists(target)) ? await fs.readFile(target, "utf8") : null;
    if (current !== source) await fs.writeFile(target, source);
    const m = await import(/* @vite-ignore */ `./.herdr-${mod}.js`);
    const d = m?.default;
    if (typeof d !== "function") return { name, ok: false, detail: `default is ${typeof d}` };
    bases[mod] = d;
    const methods = Object.getOwnPropertyNames(d.prototype).join(", ");
    return { name, ok: true, detail: `${source.length} bytes, class ${d.name} { ${methods} }` };
  } catch (e) {
    return { name, ok: false, detail: describe(e) };
  }
}

async function runProbes(): Promise<Probe[]> {
  const home = appHome();
  const out: Probe[] = [];
  out.push(await tryImport("./control.js"));
  for (const spec of [
    "../new-menu/main.js",
    "mods/new-menu/main.js",
    `${home}/mods/new-menu/main.js`,
    `file://${home}/mods/new-menu/main.js`,
    "new-menu",
    "data:text/javascript,export default 7",
  ])
    out.push(await tryImport(spec));
  // oxlint-disable-next-line eslint/no-eval -- the probe checks whether Herdr allows it
  out.push(trySync("eval", () => (0, eval)("1 + 1")));
  // oxlint-disable-next-line typescript/no-implied-eval -- the probe checks whether Herdr allows it
  out.push(trySync("new Function", () => new Function("return 2")()));
  try {
    const text = await readTextFile(`${home}/mods/new-menu/main.js`);
    out.push({
      name: "readTextFile(new-menu)",
      ok: text !== null,
      detail: `${text?.length ?? 0} bytes`,
    });
  } catch (e) {
    out.push({ name: "readTextFile(new-menu)", ok: false, detail: describe(e) });
  }
  out.push(await runtimeCopy("new-menu"));
  out.push(await runtimeCopy("menu"));
  return out;
}

// The same calls `tabs` and `spaces` make for Herdr's menus, aimed at this mod.
function openNew() {
  openOverlay({ mod: SELF, kind: "popup", width: 250, height: 560, props: { role: "new-menu" } });
}

function openSpaceMenu() {
  const space = spaces().find((s) => s.active);
  openOverlay({
    mod: SELF,
    kind: "popup",
    width: 200,
    height: 300,
    props: { role: "menu", tab: "space", target: { id: space?.id } },
  });
}

export default class MenuProbe extends View {
  // oxlint-disable-next-line typescript/no-explicit-any -- the borrowed Herdr methods set their own fields
  [key: string]: any;

  init(p: unknown, cx: AnyClass) {
    // props() is untyped host data; this mod sets `role` itself when it opens the popup.
    const role = props()?.role as string | undefined;
    if (role === "new-menu" || role === "menu") {
      this.role = role;
      const Base = bases[role];
      if (!Base) {
        this.missing = true;
        return;
      }
      // Herdr's render calls its own helpers (`this.row`, `this.choose`): give them to this instance.
      for (const k of Object.getOwnPropertyNames(Base.prototype))
        if (!["constructor", "init", "render"].includes(k)) this[k] = Base.prototype[k].bind(this);
      Base.prototype.init?.call(this, p, cx);
      return;
    }
    // The index signature types fields as any; pin the probe list to its real type.
    this.probes = [] as Probe[];
    cx.spawn(async (cx: AnyClass) => {
      this.probes = await runProbes();
      cx.notify();
    });
    // `herdr-app do menu-probe.open-new` / `menu-probe.open-menu`, so the probe runs without a click.
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "open-new") openNew();
        if (c === "open-menu") openSpaceMenu();
      }
    });
  }

  render(cx: AnyClass) {
    // theme() is typed as plain strings, but the style methods want hex colours.
    const t = theme() as Colors;
    if (this.role) return this.renderWrapped(cx, t);
    return v_flex()
      .size_full()
      .p(10)
      .gap(6)
      .bg(t.surface)
      .text_color(t.foreground)
      .text_size(12)
      .overflow_y_scrollbar()
      .child(div().font_semibold().child("Load another mod's code?"))
      .children(
        // The index signature types fields as any; the list holds probes.
        (this.probes as Probe[]).map((r, i) =>
          v_flex()
            .id(`probe-${i}`)
            .child(
              h_flex()
                .gap(6)
                .child(
                  div()
                    .text_color(r.ok ? t.done : t.blocked)
                    .child(r.ok ? "OK" : "NO"),
                )
                .child(r.name),
            )
            .child(div().text_size(11).text_color(t.muted).child(r.detail)),
        ),
      )
      .child(
        h_flex()
          .gap(8)
          .pt(6)
          .child(this.button("open-new", "Open wrapped + menu", t, openNew))
          .child(this.button("open-menu", "Open wrapped space menu", t, openSpaceMenu)),
      );
  }

  button(id: string, label: string, t: Colors, action: () => void) {
    return div()
      .id(id)
      .px(8)
      .py(4)
      .rounded(6)
      .bg(t.raised)
      .hover((s: AnyClass) => s.bg(t.hover))
      .on_click(action)
      .child(label);
  }

  renderWrapped(cx: AnyClass, t: Colors) {
    const Base = bases[this.role];
    if (this.missing || !Base)
      return div().p(10).bg(t.popover).child("Herdr's menu not loaded yet: open the panel first.");
    const say = () => {
      closeOverlay(props()?.overlay);
      notify({ title: "menu-probe", body: `Wrapped ${this.role} item clicked`, level: "info" });
    };
    // Herdr's own element, then ours appended to it.
    const el = Base.prototype.render.call(this, cx);
    if (this.role === "new-menu") {
      // Borrow Herdr's row() so the item looks like its own; grow the fixed height by one row.
      const row = this.row(
        "probe-item",
        div().w(14).child("W"),
        "Worktrunk: new worktree (probe)",
        say,
      );
      return el
        .child(div().h(1).mx(4).my(5).bg(t.border))
        .child(row)
        .h(491 + 41);
    }
    return el.child(
      h_flex()
        .id("probe-item")
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .hover((s: AnyClass) => s.bg(t.hover))
        .on_click(say)
        .child(div().w(14).child("W"))
        .child("Worktrunk item (probe)"),
    );
  }
}
