/**
 * Lint rules tied to this project's technology choices. They are opinionated
 * and separate from the architecture rules in architecture-plugin.mjs: a
 * project with the same architecture but another stack would replace this
 * plugin's configuration, not the architecture rules.
 */
import { describeFile, importVisitors } from "./paths.mjs";

const vendorImports = {
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

    const applies = (vendor) =>
      !vendor.workspace || file.workspace.endsWith(`/${vendor.workspace}`);
    const matches = (vendor, source) =>
      vendor.packages.some(
        (name) => source === name || source.startsWith(`${name}/`),
      );

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

export default {
  meta: { name: "stack" },
  rules: {
    "vendor-imports": vendorImports,
  },
};
