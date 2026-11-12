import { readFileSync } from "node:fs";
import path from "node:path";
import { describeFile, importVisitors } from "./paths.mjs";

const PARTS = /^features\/core\/ui\/(shadcn|core|registry)\//;
const ICON_PACKAGES =
  /^(?:lucide(?:-react)?|@lucide\/|@hugeicons\/|@tabler\/icons|@phosphor-icons\/|phosphor-react|react-icons(?:\/|$)|@radix-ui\/react-icons|@heroicons\/|@iconify\/|@fortawesome\/|@ant-design\/icons|@icons-pack\/react-simple-icons|simple-icons|@mui\/icons-material|@carbon\/icons-react|@remixicon\/react|iconoir-react|react-feather|feather-icons)(?:\/|$)?/;
const ICON_LIBRARIES = {
  lucide: ["lucide-react"],
  tabler: ["@tabler/icons-react"],
  phosphor: ["@phosphor-icons/react"],
  hugeicons: ["@hugeicons/react", "@hugeicons/core-free-icons"],
  remixicon: ["@remixicon/react"],
};

function pageFile(context) {
  const file = describeFile(context.filename ?? context.getFilename());
  return file?.workspace.endsWith("/frontend") &&
    !file.isTest &&
    !PARTS.test(file.inSrc)
    ? file
    : null;
}

export const pageImports = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      base: "Import a shadcn or core control, not '{{source}}'. See docs/agents/ui-shadcn.md.",
      icon: "Import icons from the '{{library}}' iconLibrary in components.json. simple-icons is only for brand logos.",
    },
  },
  create(context) {
    const file = pageFile(context);
    if (!file) return {};
    let library = "lucide";
    try {
      library = JSON.parse(
        readFileSync(path.join(file.workspace, "components.json"), "utf8"),
      ).iconLibrary;
    } catch {}
    const visit = (node, source) => {
      if (/^@base-ui\/react(?:\/|$)/.test(source))
        context.report({ node, messageId: "base", data: { source } });
      if (
        ICON_PACKAGES.test(source) &&
        !/^simple-icons(?:\/|$)/.test(source) &&
        !(ICON_LIBRARIES[library] ?? []).some(
          (name) => source === name || source.startsWith(name + "/"),
        )
      )
        context.report({ node, messageId: "icon", data: { library } });
    };
    return {
      ...importVisitors(visit),
      CallExpression(node) {
        if (
          node.callee.name === "require" &&
          typeof node.arguments[0]?.value === "string"
        )
          visit(node, node.arguments[0].value);
      },
    };
  },
};

function utilityClass(token) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index++) {
    if (token[index] === "[" || token[index] === "(") depth++;
    if (token[index] === "]" || token[index] === ")") depth--;
    if (token[index] === ":" && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!|!$/g, "");
}

export const pageClasses = {
  meta: {
    type: "problem",
    schema: [{ type: "object" }],
    messages: {
      arbitrary:
        "Use a theme utility or a shared control, not '{{token}}'. No bracket values outside the UI layers. See docs/agents/ui-shadcn.md.",
      spacing:
        "Use one of {{allowed}} for gap, space, and padding, not '{{token}}'. See docs/agents/ui-shadcn.md.",
    },
  },
  create(context) {
    const file = pageFile(context);
    if (!file) return {};
    const allowed = context.options[0]?.spacing ?? [];
    const check = (node, text) => {
      for (const token of text.split(/\s+/)) {
        const utility = utilityClass(token);
        if (/^(?:-?[\w-]+-\[|\[[\w-]+:)/.test(utility))
          context.report({ node, messageId: "arbitrary", data: { token } });
        const spacing = utility.match(
          /^-?(?:gap(?:-[xy])?|space-[xy]|p[xytrblse]?)-(.+)$/,
        )?.[1];
        if (spacing && spacing !== "reverse" && !allowed.includes(spacing))
          context.report({
            node,
            messageId: "spacing",
            data: { token, allowed: allowed.join(", ") },
          });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
