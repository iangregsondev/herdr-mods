import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";
import plugin from "./oxlint-functional.ts";

RuleTester.describe = describe;
RuleTester.it = it;

// Parse as TypeScript, like the modules the rules run on.
const tester = new RuleTester({
  languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } },
});
const rule = (name: string) => {
  const found = plugin.rules[name];
  if (!found) throw new Error(`no rule ${name}`);
  return found;
};

tester.run("no-let", rule("no-let"), {
  valid: ["const a = 1;"],
  invalid: [
    { code: "let a = 1;", errors: [{ messageId: "noLet" }] },
    { code: "var a = 1;", errors: [{ messageId: "noLet" }] },
  ],
});

tester.run("no-loop-statements", rule("no-loop-statements"), {
  valid: ["const ys = [1, 2].map((x) => x * 2);"],
  invalid: [
    { code: "for (;;) {}", errors: [{ messageId: "noLoop" }] },
    { code: "for (const x of xs) {}", errors: [{ messageId: "noLoop" }] },
    { code: "for (const k in o) {}", errors: [{ messageId: "noLoop" }] },
    { code: "while (ok) {}", errors: [{ messageId: "noLoop" }] },
    { code: "do {} while (ok);", errors: [{ messageId: "noLoop" }] },
  ],
});

tester.run("no-throw-statements", rule("no-throw-statements"), {
  valid: ["const fail = () => Effect.fail(new Oops());"],
  invalid: [{ code: "throw new Error('x');", errors: [{ messageId: "noThrow" }] }],
});

tester.run("immutable-data", rule("immutable-data"), {
  valid: [
    "const o = { ...p, a: 1 };",
    "const ys = [...xs, 1];",
    // A value made in the same expression is not shared yet.
    "const ys = [...xs].sort();",
    "const o = Object.assign({}, p);",
    "const m = new Map().set('a', 1);",
    "const zeros = new Array(3).fill(0);",
    // A copying call makes a new value too.
    "const ys = xs.slice().sort(cmp);",
    "const ys = xs.map(f).sort();",
    "const ys = xs.filter(f).sort();",
    "const ys = xs.concat(zs).sort();",
    "const ys = xs.flatMap(f).sort();",
    "const ys = Array.from(s).sort();",
    "const es = Object.entries(o).sort();",
    "const ks = Object.keys(o).sort();",
    "const vs = Object.values(o).sort();",
    "const ys = Object.assign([], xs);",
    // A computed key that's a variable could name anything, so it isn't read as a method.
    "xs[push](1);",
    // Only `delete` changes its operand; other unary operators read it.
    "const b = !o.a; const t = typeof o.a; const n = -x;",
    "const ok = Reflect.set({}, 'a', 1);",
    // Local bindings are no-let's job, not this rule's.
    "x = 1;",
    "x++;",
    "const [a] = xs;",
    "[a, b] = [b, a];",
    "({ a, b: c = 1, ...rest } = p);",
    // A computed key is read, not written.
    "({ [o.k]: a } = p);",
  ],
  invalid: [
    { code: "o.a = 1;", errors: [{ messageId: "noMutation" }] },
    { code: "o['a'] = 1;", errors: [{ messageId: "noMutation" }] },
    { code: "o.n += 1;", errors: [{ messageId: "noMutation" }] },
    { code: "o.n++;", errors: [{ messageId: "noMutation" }] },
    { code: "delete o.a;", errors: [{ messageId: "noMutation" }] },
    { code: "xs.push(1);", errors: [{ messageId: "noMutation" }] },
    { code: "xs.sort();", errors: [{ messageId: "noMutation" }] },
    { code: "arr.fill(0);", errors: [{ messageId: "noMutation" }] },
    // Only copying calls make a new value; find returns an element that is still shared.
    { code: "xs.find(f).sort();", errors: [{ messageId: "noMutation" }] },
    { code: "Other.from(s).sort();", errors: [{ messageId: "noMutation" }] },
    { code: "Other.keys(o).sort();", errors: [{ messageId: "noMutation" }] },
    { code: "xs['push'](1);", errors: [{ messageId: "noMutation" }] },
    { code: "a.b.splice(0, 1);", errors: [{ messageId: "noMutation" }] },
    { code: "m.set('a', 1);", errors: [{ messageId: "noMutation" }] },
    { code: "m.delete('a');", errors: [{ messageId: "noMutation" }] },
    { code: "m.clear();", errors: [{ messageId: "noMutation" }] },
    { code: "s.add(x);", errors: [{ messageId: "noMutation" }] },
    { code: "Reflect.set(o, 'a', 1);", errors: [{ messageId: "noMutation" }] },
    { code: "Reflect.deleteProperty(o, 'a');", errors: [{ messageId: "noMutation" }] },
    { code: "Reflect.defineProperty(o, 'a', {});", errors: [{ messageId: "noMutation" }] },
    { code: "[xs[0]] = [1];", errors: [{ messageId: "noMutation" }] },
    { code: "({ a: o.a } = p);", errors: [{ messageId: "noMutation" }] },
    { code: "[o.a = 1] = xs;", errors: [{ messageId: "noMutation" }] },
    { code: "[...o.rest] = xs;", errors: [{ messageId: "noMutation" }] },
    { code: "({ ...o.rest } = p);", errors: [{ messageId: "noMutation" }] },
    { code: "({ a: [o.b] } = p);", errors: [{ messageId: "noMutation" }] },
    { code: "Object.assign(o, p);", errors: [{ messageId: "noMutation" }] },
    { code: "Object.defineProperty(o, 'a', {});", errors: [{ messageId: "noMutation" }] },
  ],
});

tester.run("explained-cast", rule("explained-cast"), {
  valid: [
    "const xs = [1, 2] as const;",
    "// gpui wants hex colours; theme() is typed as plain strings.\nconst t = theme() as Colors;",
    "const t = theme() as Colors; // theme() is typed as plain strings",
    "const n = 1 satisfies number;",
    "const xs = <const>[1];",
    // A multi-line cast is explained above the line its `as` sits on.
    "const t = theme({\n  dark: true,\n  // theme() is typed as plain strings.\n}) as Colors;",
  ],
  invalid: [
    {
      code: "foo(); // done\nconst t = theme() as Colors;",
      errors: [{ messageId: "explainCast" }],
    },
    {
      code: "// oxlint-disable-next-line no-x\nconst t = theme() as Colors;",
      errors: [{ messageId: "explainCast" }],
    },
    {
      code: "/* eslint-disable no-x */\nconst t = theme() as Colors;",
      errors: [{ messageId: "explainCast" }],
    },
    { code: "const t = theme() as Colors;", errors: [{ messageId: "explainCast" }] },
    { code: "const t = <Colors>theme();", errors: [{ messageId: "explainCast" }] },
    {
      code: "// A comment two lines up doesn't count.\n\nconst t = theme() as Colors;",
      errors: [{ messageId: "explainCast" }],
    },
  ],
});
