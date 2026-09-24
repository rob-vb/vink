// Every public Convex function must go through the tenancy wrapper in
// convex/lib/functions.ts, which checks the caller's Membership (ADR 0001).
// This rule bans the raw builders everywhere else.

const RAW = {
  generated: new Set(["query", "mutation", "action"]),
  "convex/server": new Set(["queryGeneric", "mutationGeneric", "actionGeneric"]),
};

function rawNamesFrom(source) {
  if (/(^|\/)_generated\/server(\.js)?$/.test(source)) return RAW.generated;
  if (source === "convex/server") return RAW["convex/server"];
  return null;
}

/** @type {import("@typescript-eslint/utils").TSESLint.RuleModule<"raw">} */
const noRawConvexFunctions = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw Convex query, mutation and action builders; use the tenancy wrapper",
    },
    messages: {
      raw: "Raw Convex `{{name}}` is banned. Build public functions with the wrappers in convex/lib/functions.ts (userQuery, orgQuery, orgMutation, …).",
    },
    schema: [],
  },
  create(context) {
    const namespaces = new Map();
    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        const raw = rawNamesFrom(node.source.value);
        if (!raw) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            namespaces.set(specifier.local.name, raw);
          } else if (
            specifier.type === "ImportSpecifier" &&
            specifier.importKind !== "type" &&
            raw.has(specifier.imported.name)
          ) {
            context.report({
              node: specifier,
              messageId: "raw",
              data: { name: specifier.imported.name },
            });
          }
        }
      },
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || node.property.type !== "Identifier") return;
        const raw = namespaces.get(node.object.name);
        if (raw?.has(node.property.name)) {
          context.report({ node, messageId: "raw", data: { name: node.property.name } });
        }
      },
    };
  },
};

export default noRawConvexFunctions;
