// Herdr's tab bar, sidebar, "+" menu and context menu, with worktrunk items added.
// Herdr gives mods no way to add menu items (docs/adr/0002), so each copy of this mod
// plays one of Herdr's own mods: it copies Herdr's installed `main.js` into this mod's
// folder (patched where `wraps.ts` says), imports the copy and shows Herdr's view from it.
// Herdr's new items and fixes arrive by themselves; no Herdr code is kept in this repo.
// This file is the thin Herdr layer: copies.ts makes the copies, items.ts places ours.
import {
  View,
  div,
  svg,
  type AsyncContext,
  type Context,
  type Element,
  type ViewClass,
} from "gpui-kit";
import { v_flex } from "gpui-base";
import {
  appHome,
  closeOverlay,
  layout,
  notify,
  openOverlay,
  pickFolder,
  props,
  readTextFile,
  run,
  setShared,
  spaces,
  theme,
  writeTextFile,
} from "herdr";
import { Cause, Effect, Exit, Layer, Option, Predicate, Result } from "effect";
import { at, deliveryFor, Files, requestKey, text, type MenuRequest } from "worktrunk-mailbox";
import { loadCopy, Modules, type Copy } from "./copies.ts";
import { newMenuAnchor, requestOf, withWorktrunkItems, type NewMenuRow } from "./items.ts";
import { describeMisses } from "./patch.ts";
import { NEW_MENU_HEIGHT, SPACE_MENU_HEIGHT, roleIn, type Role } from "./wraps.ts";

/** The worktrunk panel these items ask to do the work. */
const PANEL = `${__NAMESPACE__}-worktrunk`;

type Colors = Record<string, `#${string}`>;

/** Herdr's API, as the services call it. */
const services = Layer.mergeAll(
  Files.layer({ readTextFile, writeTextFile, pickFolder }),
  // A variable specifier, so the bundler leaves the import for Herdr to resolve, from
  // this mod's own folder.
  Modules.layer((file) => import(/* @vite-ignore */ `./${file}`)),
);

/**
 * Runs a program at the edge. The programs never fail (copies.ts turns every failure
 * into a value), so only a defect, a bug, is left: it becomes a failed Result too.
 */
const runEdge = <A>(
  program: Effect.Effect<Result.Result<A, string>, never, Files | Modules>,
): Promise<Result.Result<A, string>> =>
  Effect.runPromiseExit(program.pipe(Effect.provide(services))).then(
    Exit.match({
      onSuccess: (value) => value,
      onFailure: (cause) => Result.fail(Cause.pretty(cause)),
    }),
  );

/** One load per Herdr mod, shared by every copy of this mod (module scope is shared). */
const loads = new Map<Role, Promise<Result.Result<Copy, string>>>();
/** The copies loaded so far, so a copy opened later starts Herdr's view in its own init. */
const ready = new Map<Role, Copy>();

/** Says once per load that a patch point no longer fits, so the copy is Herdr's own. */
const reportMisses = (role: Role, copy: Copy) => {
  if (copy.misses.length === 0) return;
  const body = `Herdr's ${role} changed, so worktrunk items are left out: ${describeMisses(copy.misses)}. Using Herdr's own ${role} until apps/menus is updated.`;
  console.error(`${__MOD_ID__}: ${body}`);
  notify({ title: "worktrunk menus: patch point not found", body, level: "warning" });
};

/**
 * Loads the copy for `role`, once. A load that fails is tried again by the next copy
 * that needs it.
 */
const load = (role: Role): Promise<Result.Result<Copy, string>> => {
  const started = loads.get(role);
  if (started) return started;
  const loading = runEdge(loadCopy(role, appHome(), __MOD_ID__)).then((loaded) => {
    Result.match(loaded, {
      onSuccess: (copy) => {
        ready.set(role, copy);
        reportMisses(role, copy);
      },
      onFailure: () => loads.delete(role),
    });
    return loaded;
  });
  loads.set(role, loading);
  return loading;
};

/** The copy's view class: Herdr's mods default-export a class extending View (copies.ts checks). */
const viewOf = (copy: Copy): ViewClass =>
  // copies.ts made sure the default export is a function; Herdr's mods export a View class.
  copy.exports.default as ViewClass;

/** Hands `request` to the worktrunk panel, showing the panel first when it is hidden. */
const deliver = (request: MenuRequest) => {
  const post = () =>
    setShared(requestKey(PANEL), { id: Date.now() + Math.random(), action: request });
  const delivery = deliveryFor(layout(), PANEL);
  switch (delivery._tag) {
    case "Post":
      return post();
    case "ShowThenPost":
      run("layout.show", { id: delivery.id });
      return post();
    case "NoPanel":
      notify({
        title: "No worktrunk panel here",
        body: "Worktree (wt) items need the worktrunk panel in this layout: run herdr:sync and use its layout.",
        level: "warning",
      });
      return null;
  }
};

const ownProps = (): Record<string, unknown> => {
  const value: unknown = props();
  return Predicate.isObject(value) ? { ...value } : {};
};

/** Closes this copy when it is an overlay (Herdr adds the overlay's id to its props). */
const closeSelf = () => Option.map(text(at(props(), "overlay")), closeOverlay);

/** Opens this menu again, with the same props, now that Herdr's copy is loaded. */
const reopen = (role: "new-menu" | "menu") => {
  const { overlay: _overlay, ...same } = ownProps();
  closeSelf();
  openOverlay({
    mod: __MOD_ID__,
    kind: "popup",
    ...(role === "new-menu"
      ? { width: 250, height: NEW_MENU_HEIGHT }
      : { width: 200, height: SPACE_MENU_HEIGHT }),
    props: same,
  });
};

/** Herdr's own menu, opened in place of ours when Herdr's code couldn't be loaded. */
const openHerdrMenu = (role: Role) => {
  const { role: _ours, overlay: _overlay, ...rest } = ownProps();
  if (role === "new-menu") {
    openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
  } else if (role === "menu") {
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: rest });
  }
};

/**
 * The menu copy's class with `choose` taking our items: they ask the worktrunk panel,
 * by mouse or by Enter, and every other item goes to Herdr's own `choose`.
 */
function menuWithOurItems(copy: Copy): ViewClass {
  const setExtend = copy.exports.__wtSetExtend;
  const items = copy.exports.__wtItems;
  if (!Predicate.isFunction(setExtend) || !Predicate.isFunction(items)) return viewOf(copy);
  setExtend(withWorktrunkItems);
  // The patched copy's tail defines `__wtItems(p, git)`, returning the menu's item list.
  const listFor = items as (p: unknown, git: unknown) => unknown;
  // The patched copy's class: Herdr's Menu, whose `choose(i, cx)` and `git` field we use.
  const Base = viewOf(copy) as unknown as new () => {
    git: unknown;
    choose(i: number, cx: unknown): void;
    render(cx: Context): Element;
  };
  class WithOurItems extends Base {
    choose(i: number, cx: unknown) {
      const list = listFor(props(), this.git);
      Option.match(requestOf(Array.isArray(list) ? list[i] : undefined), {
        onNone: () => super.choose(i, cx),
        onSome: (request) => {
          closeSelf();
          deliver(request);
        },
      });
    }
  }
  // The subclass adds one method; it is still the View class Herdr's copy exported.
  return WithOurItems as unknown as ViewClass;
}

/** Whether the toast for a "+" menu with no worktree row was shown in this load. */
let toldNoAnchor = false;

/** Says once per load that Herdr's "+" menu has no worktree row for ours to follow. */
const reportNoAnchor = () => {
  if (toldNoAnchor) return;
  toldNoAnchor = true;
  const body = 'new-menu: worktree rows (not found), so "Worktree (wt)…" sits after its last row';
  console.error(`${__MOD_ID__}: ${body}`);
  notify({
    title: "worktrunk menus: patch point not found",
    body: `Herdr's new-menu changed: ${body}. Update apps/menus.`,
    level: "warning",
  });
};

/**
 * The "+" menu copy's class with our item just after Herdr's worktree rows, drawn with
 * Herdr's own `row()` so it looks like theirs (`row` closes the menu before acting).
 * Herdr's `render` is run twice: once to list its rows (`newMenuAnchor` picks the one
 * ours follows), then to draw, with `row` adding ours after that one. Without a worktree
 * row, ours follows Herdr's last row and a toast names the patch point. The copy's menu
 * is one row taller than Herdr's (`wraps.ts`); a copy left unpatched is Herdr's own menu.
 */
function newMenuWithOurItem(copy: Copy): ViewClass {
  if (copy.misses.length > 0) return viewOf(copy);
  // The copy's class: Herdr's NewMenu, whose `render` and `row(...)` helper we use.
  const Base = viewOf(copy) as unknown as new () => {
    render(cx: Context): Element;
    row(
      id: string,
      icon: Element,
      name: string,
      action: () => void,
      hint?: string,
      enabled?: boolean,
    ): Element;
  };
  if (!Predicate.isFunction(Base.prototype.row)) return viewOf(copy);
  class WithOurItem extends Base {
    /** Herdr's rows, while its `render` runs to list them; null while it draws. */
    wtRows: NewMenuRow[] | null;
    /** The row ours follows in the drawing pass. */
    wtAnchor: Option.Option<string>;

    wtOurs(): Element {
      return super.row(
        "worktrunk-new",
        svg(`mods/${__MOD_ID__}/branch.svg`).size(14),
        "Worktree (wt)…",
        () => deliver({ _tag: "NewOrOpen", folder: null }),
        "",
        spaces().some((space) => space.active),
      );
    }

    row(
      id: string,
      icon: Element,
      name: string,
      action: () => void,
      hint?: string,
      enabled?: boolean,
    ): Element {
      const drawn = super.row(id, icon, name, action, hint, enabled);
      if (this.wtRows) {
        this.wtRows.push({ id, name });
        return drawn;
      }
      return Option.contains(this.wtAnchor, id)
        ? v_flex().flex_none().w_full().child(drawn).child(this.wtOurs())
        : drawn;
    }

    render(cx: Context): Element {
      this.wtRows = [];
      super.render(cx);
      const rows = this.wtRows;
      this.wtRows = null;
      const anchor = newMenuAnchor(rows);
      if (Option.isNone(anchor)) reportNoAnchor();
      this.wtAnchor = Option.orElse(anchor, () =>
        Option.map(Option.fromNullishOr(rows.at(-1)), (row) => row.id),
      );
      return super.render(cx);
    }
  }
  // The subclass changes `render` and `row`; it is still the View class Herdr's copy exported.
  return WithOurItem as unknown as ViewClass;
}

/** Our own members, never overwritten by Herdr's. */
const OWN = new Set(["constructor", "init", "render", "close", "wtRole", "wtView", "wtFailure"]);

/**
 * Gives `self` the methods of `view` and its parents up to `View` (a subclass's first),
 * bound to it: Herdr's `render` calls its own helpers (`this.row`, `this.choose`).
 */
const adopt = (self: object, view: ViewClass) => {
  const top: unknown = View.prototype;
  const chain = (proto: unknown): object[] =>
    Predicate.isObject(proto) && proto !== top
      ? [proto, ...chain(Object.getPrototypeOf(proto))]
      : [];
  // Every member, subclass first; a name already taken by a subclass is skipped.
  const taken = new Set<string>();
  for (const proto of chain(view.prototype)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (OWN.has(name) || taken.has(name)) continue;
      taken.add(name);
      const value: unknown = Object.getOwnPropertyDescriptor(proto, name)?.value;
      if (Predicate.isFunction(value)) Reflect.set(self, name, value.bind(self));
    }
  }
};

/** Calls `view`'s own `init` or `render` (found up its chain) on `self`. */
const callOn = (view: ViewClass, method: "init" | "render", self: object, ...args: unknown[]) => {
  const found: unknown = Reflect.get(view.prototype, method);
  return Predicate.isFunction(found) ? found.apply(self, args) : undefined;
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export default class Menus extends View {
  /** The part this copy plays; none when its props name none of ours. */
  wtRole: Option.Option<Role> = Option.none();
  /** Herdr's view class (with our overrides) this copy plays, once loaded. */
  wtView: ViewClass | null = null;
  /** Why Herdr's code couldn't be shown. */
  wtFailure = "";

  init(_props: unknown, cx: AsyncContext) {
    this.wtRole = roleIn(props());
    Option.map(this.wtRole, (role) => {
      // The tab bar and sidebar load their menus early, so a menu opens with no wait.
      if (role === "tabs") void load("new-menu");
      if (role === "spaces") void load("menu");
      // Herdr's init runs here, with init's own context, when the copy is loaded already
      // (the usual case: the tab bar and sidebar load the menus first).
      const loaded = ready.get(role);
      if (loaded) return this.start(role, loaded, cx);
      cx.spawn(async (cx) => {
        const copy = await load(role);
        Result.match(copy, {
          onSuccess: (copy) => {
            // A menu's init started from a task loses the tasks it starts (the space
            // menu's git check never answers), so a menu opened too early opens again.
            if (role === "new-menu" || role === "menu") return reopen(role);
            this.start(role, copy, cx);
          },
          onFailure: (reason) => this.fail(role, reason),
        });
        cx.notify();
      });
    });
  }

  /** Becomes Herdr's view for `role`, from `copy`, and runs Herdr's init. */
  start(role: Role, copy: Copy, cx: AsyncContext) {
    try {
      const view =
        role === "menu"
          ? menuWithOurItems(copy)
          : role === "new-menu"
            ? newMenuWithOurItem(copy)
            : viewOf(copy);
      adopt(this, view);
      callOn(view, "init", this, props(), cx);
      this.wtView = view;
    } catch (error) {
      // Herdr's own code threw: show why, and fall back to Herdr's mod.
      this.fail(role, describe(error));
    }
  }

  fail(role: Role, reason: string) {
    this.wtView = null;
    this.wtFailure = reason;
    console.error(`${__MOD_ID__} (${role}): ${reason}`);
    if (role === "new-menu" || role === "menu") {
      closeSelf();
      openHerdrMenu(role);
    } else {
      notify({
        title: `Couldn't show Herdr's ${role}`,
        body: `${reason}. Switch to Herdr's own layout (layout.switch) until it's fixed.`,
        level: "error",
      });
    }
  }

  render(cx: Context): Element {
    // theme() is typed as plain strings, but the style methods want hex colours.
    const t = theme() as Colors;
    const role = Option.getOrNull(this.wtRole);
    if (role === null) {
      return div().p(8).text_color(t.muted).child(`${__MOD_ID__}: no role in props`);
    }
    if (this.wtView !== null) {
      // Herdr's render returns its element; ours adds to it in the subclasses.
      return callOn(this.wtView, "render", this, cx) as Element;
    }
    return div()
      .size_full()
      .text_size(11)
      .text_color(t.dim)
      .child(this.wtFailure === "" ? "" : `Herdr's ${role}: ${this.wtFailure}`);
  }
}
