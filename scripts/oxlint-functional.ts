// Functional-style lint rules for pure modules (.claude/rules/functional-style.md).
// Local stand-in for eslint-plugin-functional, which can't load under TypeScript 7
// (its ts-api-utils needs TypeScript's JS API). Syntax only: no type information.
import { definePlugin, defineRule, type ESTree, type Node } from "vite-plus/lint/plugins";

const noLet = defineRule({
  meta: { type: "problem", messages: { noLet: "Use const: no let or var in pure modules." } },
  create: (context) => ({
    VariableDeclaration: (node) => {
      if (node.kind === "let" || node.kind === "var") context.report({ node, messageId: "noLet" });
    },
  }),
});

const noLoop = defineRule({
  meta: {
    type: "problem",
    messages: { noLoop: "No loops in pure modules: use map, filter, reduce or recursion." },
  },
  create: (context) => {
    const report = (node: Node) => context.report({ node, messageId: "noLoop" });
    return {
      ForStatement: report,
      ForInStatement: report,
      ForOfStatement: report,
      WhileStatement: report,
      DoWhileStatement: report,
    };
  },
});

const noThrow = defineRule({
  meta: {
    type: "problem",
    messages: { noThrow: "No throw in pure modules: return a tagged error (Effect.fail, Result)." },
  },
  create: (context) => ({
    ThrowStatement: (node) => context.report({ node, messageId: "noThrow" }),
  }),
});

const MUTATING_METHODS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
  // Map and Set. Syntax carries no types, so a user-defined method of the same name counts.
  "set",
  "add",
  "delete",
  "clear",
]);
// Static functions that change their first argument.
const MUTATING_STATICS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["Object", new Set(["assign", "defineProperty", "defineProperties", "setPrototypeOf"])],
  ["Reflect", new Set(["set", "deleteProperty", "defineProperty"])],
]);

// Calls that return a new array, so the result isn't shared with anything yet.
const COPYING_METHODS = new Set(["slice", "map", "filter", "concat", "flatMap"]);
const COPYING_STATICS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["Array", new Set(["from"])],
  ["Object", new Set(["entries", "keys", "values"])],
]);

const propertyName = (member: ESTree.MemberExpression): string | undefined => {
  const property = member.property;
  if (!member.computed && property.type === "Identifier") return property.name;
  if (property.type === "Literal" && typeof property.value === "string") return property.value;
  return undefined;
};

// Whether `callee` is `Owner.name` for one of the names listed under that owner.
const isStaticCall = (
  callee: ESTree.MemberExpression,
  statics: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  if (callee.object.type !== "Identifier") return false;
  const names = statics.get(callee.object.name);
  if (names === undefined) return false;
  const name = propertyName(callee);
  return name !== undefined && names.has(name);
};

const isCopyingCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee;
  if (callee.type !== "MemberExpression") return false;
  if (isStaticCall(callee, COPYING_STATICS)) return true;
  const name = propertyName(callee);
  return name !== undefined && COPYING_METHODS.has(name);
};

// A value made in the same expression isn't shared yet, so changing it is safe.
const isFresh = (node: ESTree.Argument): boolean =>
  node.type === "ArrayExpression" ||
  node.type === "ObjectExpression" ||
  node.type === "NewExpression" ||
  (node.type === "CallExpression" && isCopyingCall(node));

// `xs.push(1)` and friends, on a value that may be shared.
const isMutatingMethodCall = (callee: ESTree.MemberExpression): boolean => {
  const name = propertyName(callee);
  return name !== undefined && MUTATING_METHODS.has(name) && !isFresh(callee.object);
};

// `Object.assign(o, p)` and friends change their first argument, not their owner,
// so a mutating static is judged on that argument alone.
const isMutatingCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee;
  if (callee.type !== "MemberExpression") return false;
  if (!isStaticCall(callee, MUTATING_STATICS)) return isMutatingMethodCall(callee);
  const target = node.arguments[0];
  return target !== undefined && !isFresh(target);
};

// Whether an assignment target writes to a property, directly or through destructuring.
const writesMember = (target: ESTree.Node | null): boolean => {
  if (target === null) return false;
  switch (target.type) {
    case "MemberExpression":
      return true;
    case "ArrayPattern":
      return target.elements.some(writesMember);
    case "ObjectPattern":
      return target.properties.some((property) =>
        writesMember(property.type === "Property" ? property.value : property),
      );
    case "AssignmentPattern":
      return writesMember(target.left);
    case "RestElement":
      return writesMember(target.argument);
    default:
      return false;
  }
};

const immutableData = defineRule({
  meta: {
    type: "problem",
    messages: {
      noMutation:
        "Don't mutate data in pure modules: build a new value (spread, map, [...xs].sort()).",
    },
  },
  create: (context) => ({
    AssignmentExpression: (node) => {
      if (writesMember(node.left)) context.report({ node, messageId: "noMutation" });
    },
    UpdateExpression: (node) => {
      if (node.argument.type === "MemberExpression")
        context.report({ node, messageId: "noMutation" });
    },
    UnaryExpression: (node) => {
      if (node.operator === "delete") context.report({ node, messageId: "noMutation" });
    },
    CallExpression: (node) => {
      if (isMutatingCall(node)) context.report({ node, messageId: "noMutation" });
    },
  }),
});

type Cast = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

const isConst = (node: Cast): boolean =>
  node.typeAnnotation.type === "TSTypeReference" &&
  node.typeAnnotation.typeName.type === "Identifier" &&
  node.typeAnnotation.typeName.name === "const";

// Lint directives switch rules on or off; they say nothing about why a cast is safe.
const DIRECTIVE = /^\s*(?:oxlint|eslint)-(?:disable|enable)/;

// A cast overrides the type checker, so it needs a reason a reader can check: a comment
// on the line above the cast's `as` (or `<T>`) token that starts its own line, or a
// comment on that token's line. `as const` only narrows.
const explainedCast = defineRule({
  meta: {
    type: "problem",
    messages: {
      explainCast:
        "Explain this type cast in a comment on the line above (why no type guard or better type works).",
    },
  },
  create: (context) => {
    const source = context.sourceCode;
    const reasons = source.getAllComments().filter((comment) => !DIRECTIVE.test(comment.value));
    const startsLine = (offset: number): boolean =>
      source.text.slice(source.text.lastIndexOf("\n", offset - 1) + 1, offset).trim() === "";
    // Lines that hold a reason for a cast whose token is on the next line.
    const aboveLines = new Set(
      reasons
        .filter((comment) => startsLine(comment.range[0]))
        .map((comment) => comment.loc.end.line),
    );
    // Lines that hold a reason for a cast whose token is on the same line.
    const ownLines = new Set(reasons.map((comment) => comment.loc.end.line));
    const tokenLine = (node: Cast): number =>
      node.type === "TSAsExpression"
        ? (source.getTokenBefore(node.typeAnnotation)?.loc.start.line ?? node.loc.start.line)
        : node.loc.start.line;
    const check = (node: Cast) => {
      const line = tokenLine(node);
      if (isConst(node) || ownLines.has(line) || aboveLines.has(line - 1)) return;
      context.report({ node, messageId: "explainCast" });
    };
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
});

export default definePlugin({
  meta: { name: "functional" },
  rules: {
    "no-let": noLet,
    "no-loop-statements": noLoop,
    "no-throw-statements": noThrow,
    "immutable-data": immutableData,
    "explained-cast": explainedCast,
  },
});
