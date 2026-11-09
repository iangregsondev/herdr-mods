import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";
import plugin from "./oxlint-functional.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { sourceType: "module" } });
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
    // Local bindings are no-let's job, not this rule's.
    "x = 1;",
  ],
  invalid: [
    { code: "o.a = 1;", errors: [{ messageId: "noMutation" }] },
    { code: "o['a'] = 1;", errors: [{ messageId: "noMutation" }] },
    { code: "o.n += 1;", errors: [{ messageId: "noMutation" }] },
    { code: "o.n++;", errors: [{ messageId: "noMutation" }] },
    { code: "delete o.a;", errors: [{ messageId: "noMutation" }] },
    { code: "xs.push(1);", errors: [{ messageId: "noMutation" }] },
    { code: "xs.sort();", errors: [{ messageId: "noMutation" }] },
    { code: "a.b.splice(0, 1);", errors: [{ messageId: "noMutation" }] },
    { code: "Object.assign(o, p);", errors: [{ messageId: "noMutation" }] },
    { code: "Object.defineProperty(o, 'a', {});", errors: [{ messageId: "noMutation" }] },
  ],
});
