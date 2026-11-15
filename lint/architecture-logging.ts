import type { CallExpression, AstNode, Rule } from "./plugin-types.ts";
import { DOC } from "./architecture-shared.ts";

const LEVELS = ["debug", "info", "warn", "error"];

const isLogger = (node: AstNode) =>
  (node.type === "Identifier" && node.name === "logger") ||
  (node.type === "MemberExpression" &&
    !node.computed &&
    node.property?.name === "logger");

const isConstant = (node: AstNode) =>
  (node.type === "Literal" && typeof node.value === "string") ||
  (node.type === "TemplateLiteral" && (node.expressions ?? []).length === 0);

export const logMessages: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "A log message is a constant string. Details go in fields.",
    },
    schema: [],
    messages: {
      constant:
        'Keep the log message constant and put the details in fields, such as `logger.warn("Readiness check failed", { error })`. ' +
        DOC +
        " (Logging).",
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        const { callee } = node;
        const first = node.arguments[0];
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          LEVELS.includes(callee.property?.name ?? "") &&
          callee.object &&
          isLogger(callee.object) &&
          first &&
          !isConstant(first)
        ) {
          context.report({ node, messageId: "constant" });
        }
      },
    };
  },
};
