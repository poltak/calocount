/**
 * Lint rules tied to this project's technology choices. They are opinionated
 * and separate from the architecture rules in architecture-plugin.ts: a
 * project with the same architecture but another stack would replace this
 * plugin's configuration, not the architecture rules.
 */
import { describeFile, importVisitors } from "./paths.ts";
import type {
  CallExpression,
  ExportAllDeclaration,
  ExportNamedDeclaration,
  ImportDeclaration,
  ImportExpression,
  Node,
  Plugin,
  Property,
  Rule,
  Specifier,
  StackOptions,
  Vendor,
} from "./plugin-types.ts";
import { pageClasses, pageImports, shadcnTypography } from "./ui-rules.ts";

const matches = (vendor: Vendor, source: string) =>
  vendor.packages.some(
    (name) => source === name || source.startsWith(`${name}/`),
  );

const nameOf = (identifier: Specifier["local"]) =>
  identifier?.name ?? identifier?.value;

const vendorImports: Rule<StackOptions> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Each vendor package is imported only in the layer that wraps it.",
    },
    schema: [{ type: "object" }],
    messages: {
      vendor:
        "'{{source}}' may be imported only in {{where}}. Other code uses it through that layer. See docs/agents/decisions.md.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = describeFile(context.filename ?? context.getFilename());
    if (!file || file.isTest) {
      return {};
    }

    const applies = (vendor: Vendor) =>
      !vendor.workspace || file.workspace.endsWith(`/${vendor.workspace}`);

    return importVisitors((node, source) => {
      for (const vendor of options.vendors ?? []) {
        if (
          applies(vendor) &&
          matches(vendor, source) &&
          !vendor.allowedIn.some((pattern) =>
            new RegExp(pattern).test(file.inSrc),
          )
        ) {
          context.report({
            node,
            messageId: "vendor",
            data: { source, where: vendor.where },
          });
        }
      }
    });
  },
};

const noComponentState: Rule<StackOptions> = {
  meta: {
    type: "problem",
    docs: {
      description: "React components keep no state. State goes in a UI Logic.",
    },
    schema: [{ type: "object" }],
    messages: {
      hook: "No component uses {{name}}. Keep state in a UI Logic. See docs/agents/code-architecture.md (Where code belongs).",
      // A check of hook names cannot see `React.useState`. This rule stops each
      // way to get the `React` object, so that it needs no tracking of
      // variables, and `const R = React` does not go around it.
      wholePackage:
        "Import from 'react' by name, so that lint can see each hook. See docs/agents/code-architecture.md (Where code belongs).",
    },
  },
  create(context) {
    const hooks = context.options[0]?.hooks ?? [];
    const file = describeFile(context.filename ?? context.getFilename());
    if (!file || file.isTest || !file.workspace.endsWith("/frontend")) {
      return {};
    }

    const checkName = (node: Node, name: string | undefined) => {
      if (name === "default") {
        context.report({ node, messageId: "wholePackage" });
      } else if (hooks.includes(name)) {
        context.report({ node, messageId: "hook", data: { name } });
      }
    };

    return {
      ImportDeclaration(node: ImportDeclaration) {
        if (node.source.value !== "react" || node.importKind === "type") {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            context.report({ node: specifier, messageId: "wholePackage" });
          } else if (specifier.importKind !== "type") {
            checkName(specifier, nameOf(specifier.imported));
          }
        }
      },
      ExportNamedDeclaration(node: ExportNamedDeclaration) {
        if (node.source?.value !== "react" || node.exportKind === "type") {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.exportKind !== "type") {
            checkName(specifier, nameOf(specifier.local));
          }
        }
      },
      ExportAllDeclaration(node: ExportAllDeclaration) {
        if (node.source.value === "react" && node.exportKind !== "type") {
          context.report({ node, messageId: "wholePackage" });
        }
      },
      ImportExpression(node: ImportExpression) {
        if (node.source.value === "react") {
          context.report({ node, messageId: "wholePackage" });
        }
      },
      CallExpression(node: CallExpression) {
        if (
          node.callee.name === "require" &&
          node.arguments[0]?.value === "react"
        ) {
          context.report({ node, messageId: "wholePackage" });
        }
      },
    };
  },
};

const encodeApiParams: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Each path parameter of an API client call is encoded.",
    },
    schema: [],
    messages: {
      encode:
        "The API client puts path parameters in the URL without encoding. Wrap each value in `encodeApiParam`. See docs/agents/code-architecture.md (Application setup).",
    },
  },
  create(context) {
    if (/\.test\.tsx?$/.test(context.filename ?? context.getFilename())) {
      return {};
    }

    return {
      Property(node: Property) {
        if (
          node.computed ||
          (node.key.name ?? node.key.value) !== "param" ||
          node.value?.type !== "ObjectExpression"
        ) {
          return;
        }
        for (const member of node.value.properties ?? []) {
          const value = member.value;
          const encoded =
            member.type === "Property" &&
            value?.type === "CallExpression" &&
            value.callee?.type === "Identifier" &&
            value.callee.name === "encodeApiParam";
          if (!encoded) {
            context.report({ node: member, messageId: "encode" });
          }
        }
      },
    };
  },
};

const plugin: Plugin = {
  meta: { name: "stack" },
  rules: {
    "vendor-imports": vendorImports,
    "no-component-state": noComponentState,
    "encode-api-params": encodeApiParams,
    "page-imports": pageImports,
    "page-classes": pageClasses,
    "shadcn-typography": shadcnTypography,
  },
};

export default plugin;
