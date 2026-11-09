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
]);
const MUTATING_OBJECT_FUNCTIONS = new Set([
  "assign",
  "defineProperty",
  "defineProperties",
  "setPrototypeOf",
]);

// A value made in the same expression isn't shared yet, so changing it is safe.
const isFresh = (node: ESTree.Argument): boolean =>
  node.type === "ArrayExpression" ||
  node.type === "ObjectExpression" ||
  node.type === "NewExpression";

const propertyName = (member: ESTree.MemberExpression): string | undefined => {
  const property = member.property;
  if (!member.computed && property.type === "Identifier") return property.name;
  if (property.type === "Literal" && typeof property.value === "string") return property.value;
  return undefined;
};

const isObjectCall = (callee: ESTree.MemberExpression): boolean => {
  const name = propertyName(callee);
  return (
    callee.object.type === "Identifier" &&
    callee.object.name === "Object" &&
    name !== undefined &&
    MUTATING_OBJECT_FUNCTIONS.has(name)
  );
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
      if (node.left.type === "MemberExpression") context.report({ node, messageId: "noMutation" });
    },
    UpdateExpression: (node) => {
      if (node.argument.type === "MemberExpression")
        context.report({ node, messageId: "noMutation" });
    },
    UnaryExpression: (node) => {
      if (node.operator === "delete") context.report({ node, messageId: "noMutation" });
    },
    CallExpression: (node) => {
      const callee = node.callee;
      if (callee.type !== "MemberExpression") return;
      if (isObjectCall(callee)) {
        const target = node.arguments[0];
        if (target && !isFresh(target)) context.report({ node, messageId: "noMutation" });
        return;
      }
      const name = propertyName(callee);
      if (name !== undefined && MUTATING_METHODS.has(name) && !isFresh(callee.object))
        context.report({ node, messageId: "noMutation" });
    },
  }),
});

export default definePlugin({
  meta: { name: "functional" },
  rules: {
    "no-let": noLet,
    "no-loop-statements": noLoop,
    "no-throw-statements": noThrow,
    "immutable-data": immutableData,
  },
});
