import { readFileSync } from "node:fs";
import path from "node:path";
import { describeFile, importVisitors } from "./paths.ts";
import type { FileDescription } from "./paths.ts";
import type {
  AstNode,
  CallExpression,
  Literal,
  Node,
  Rule,
  RuleContext,
  StackOptions,
  Template,
} from "./plugin-types.ts";

const PARTS = /^features\/core\/ui\/(shadcn|core|registry)\//;
const ICON_PACKAGES =
  /^(?:lucide(?:-react)?|@lucide\/|@hugeicons\/|@tabler\/icons|@phosphor-icons\/|phosphor-react|react-icons(?:\/|$)|@radix-ui\/react-icons|@heroicons\/|@iconify\/|@fortawesome\/|@ant-design\/icons|@icons-pack\/react-simple-icons|simple-icons|@mui\/icons-material|@carbon\/icons-react|@remixicon\/react|iconoir-react|react-feather|feather-icons)(?:\/|$)?/;
const ICON_LIBRARIES: Record<string, string[]> = {
  lucide: ["lucide-react"],
  tabler: ["@tabler/icons-react"],
  phosphor: ["@phosphor-icons/react"],
  hugeicons: ["@hugeicons/react", "@hugeicons/core-free-icons"],
  remixicon: ["@remixicon/react"],
};

function pageFile(context: RuleContext): FileDescription | null {
  const file = describeFile(context.filename ?? context.getFilename());
  return file?.workspace.endsWith("/frontend") &&
    !file.isTest &&
    !PARTS.test(file.inSrc)
    ? file
    : null;
}

export const pageImports: Rule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      base: "Import a shadcn or core control, not '{{source}}'. See docs/agents/ui-components.md.",
      icon: "Import icons from the '{{library}}' iconLibrary in components.json. simple-icons is only for brand logos.",
    },
  },
  create(context) {
    const file = pageFile(context);
    if (!file) {
      return {};
    }
    let library = "lucide";
    try {
      library = (
        JSON.parse(
          readFileSync(path.join(file.workspace, "components.json"), "utf8"),
        ) as { iconLibrary: string }
      ).iconLibrary;
    } catch {}
    const visit = (node: Node, source: string) => {
      if (/^@base-ui\/react(?:\/|$)/.test(source)) {
        context.report({ node, messageId: "base", data: { source } });
      }
      if (
        ICON_PACKAGES.test(source) &&
        !/^simple-icons(?:\/|$)/.test(source) &&
        !(ICON_LIBRARIES[library] ?? []).some(
          (name) => source === name || source.startsWith(name + "/"),
        )
      ) {
        context.report({ node, messageId: "icon", data: { library } });
      }
    };
    return {
      ...importVisitors(visit),
      CallExpression(node: CallExpression) {
        const argument = node.arguments[0]?.value;
        if (node.callee.name === "require" && typeof argument === "string") {
          visit(node, argument);
        }
      },
    };
  },
};

function utilityClass(token: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index++) {
    if (token[index] === "[" || token[index] === "(") {
      depth++;
    }
    if (token[index] === "]" || token[index] === ")") {
      depth--;
    }
    if (token[index] === ":" && depth === 0) {
      start = index + 1;
    }
  }
  return token.slice(start).replace(/^!|!$/g, "");
}

export const pageClasses: Rule<StackOptions> = {
  meta: {
    type: "problem",
    schema: [{ type: "object" }],
    messages: {
      arbitrary:
        "Use a theme utility or a shared control, not '{{token}}'. No bracket values outside the UI layers. See docs/agents/ui-components.md.",
      spacing:
        "Use one of {{allowed}} for gap, space, and padding, not '{{token}}'. See docs/agents/ui-components.md.",
    },
  },
  create(context) {
    const file = pageFile(context);
    if (!file) {
      return {};
    }
    const allowed = context.options[0]?.spacing ?? [];
    const check = (node: Node, text: string) => {
      for (const token of text.split(/\s+/)) {
        const utility = utilityClass(token);
        if (/^(?:-?[\w-]+-\[|\[[\w-]+:)/.test(utility)) {
          context.report({ node, messageId: "arbitrary", data: { token } });
        }
        const spacing = utility.match(
          /^-?(?:gap(?:-[xy])?|space-[xy]|p[xytrblse]?)-(.+)$/,
        )?.[1];
        if (spacing && spacing !== "reverse" && !allowed.includes(spacing)) {
          context.report({
            node,
            messageId: "spacing",
            data: { token, allowed: allowed.join(", ") },
          });
        }
      }
    };
    return {
      Literal(node: Literal) {
        if (typeof node.value === "string") {
          check(node, node.value);
        }
      },
      TemplateElement(node: Template) {
        check(node, node.value.raw);
      },
    };
  },
};

function classStrings(node: AstNode | null | undefined): string[] {
  if (!node) {
    return [];
  }
  if (node.type === "Literal") {
    return typeof node.value === "string" ? [node.value] : [];
  }
  if (node.type === "JSXExpressionContainer") {
    return classStrings(node.expression);
  }
  if (node.type === "TemplateLiteral") {
    return [
      ...(node.quasis ?? []).map((part) => part.value.raw),
      ...(node.expressions ?? []).flatMap(classStrings),
    ];
  }
  if (node.type === "CallExpression") {
    return (node.arguments ?? []).flatMap(classStrings);
  }
  if (node.type === "ConditionalExpression") {
    return [...classStrings(node.consequent), ...classStrings(node.alternate)];
  }
  if (node.type === "LogicalExpression") {
    return [...classStrings(node.left), ...classStrings(node.right)];
  }
  if (node.type === "ArrayExpression") {
    return (node.elements ?? []).flatMap(classStrings);
  }
  return [];
}

export const shadcnTypography: Rule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      override:
        "Let '{{component}}' use the preset typography, not '{{token}}'. Use its props or put text utilities on native text. See docs/agents/ui-components.md.",
    },
  },
  create(context) {
    const file = describeFile(context.filename ?? context.getFilename());
    if (
      !file?.workspace.endsWith("/frontend") ||
      file.isTest ||
      /^features\/core\/ui\/(shadcn|registry)\//.test(file.inSrc)
    ) {
      return {};
    }
    const components = new Set<string | undefined>();
    return {
      ImportDeclaration(node) {
        if (!/\/shadcn\//.test(node.source.value)) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            components.add(specifier.local?.name);
          }
        }
      },
      JSXAttribute(node) {
        const component = node.parent?.name?.name;
        if (node.name.name !== "className" || !components.has(component)) {
          return;
        }
        for (const text of classStrings(node.value)) {
          for (const token of text.split(/\s+/)) {
            if (
              /^(?:text-(?:xs|sm|base|lg|xl|\d+xl)(?:\/.*)?|leading-.+)$/.test(
                utilityClass(token),
              )
            ) {
              context.report({
                node,
                messageId: "override",
                data: { component, token },
              });
            }
          }
        }
      },
    };
  },
};
