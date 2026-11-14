// Architecture rules about role names, constructors, file layout, and transactions.
import type { FileDescription } from "./paths.ts";
import type {
  ArchitectureOptions,
  AstNode,
  CallExpression,
  ClassDeclaration,
  MemberExpression,
  MethodDefinition,
  Rule,
} from "./plugin-types.ts";
import { projectOptions } from "./project-options.ts";
import { DOC, currentFile } from "./architecture-shared.ts";

function roleClassKind(
  file: FileDescription,
): "Service" | "Storage" | "Logic" | "Plugin" | null {
  if (file.role === "services" && file.base.endsWith("-service")) {
    return "Service";
  }
  if (file.role === "storage" && file.base.endsWith("-storage")) {
    return "Storage";
  }
  if (file.base.endsWith("-logic")) {
    return "Logic";
  }
  if (file.base.endsWith("-plugin")) {
    return "Plugin";
  }
  return null;
}

export const roleNaming: Rule<ArchitectureOptions> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Service, Storage, Logic, and LogicPlugin files and classes follow the naming scheme.",
    },
    schema: [{ type: "object" }],
    messages: {
      file: "Files in {{role}}/ must be named {{allowed}}. " + DOC + ".",
      className:
        "The class in '{{file}}' must be named after the file and end with '{{suffix}}'. " +
        DOC +
        " (Class roles).",
      interface:
        "A Service class must implement an interface named <Name>ServiceInterface from types.ts. " +
        DOC +
        " (Class roles).",
      base: "A {{kind}} class must extend {{base}}. " + DOC + " (Class roles).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (
      !file?.feature ||
      file.isTest ||
      (options.exemptFeatures ?? []).includes(file.feature)
    ) {
      return {};
    }

    const suffixesByRole: Record<string, string[]> = {
      services: ["-service"],
      storage: ["-storage"],
      logic: ["-logic", "-plugin"],
    };
    const allowedFiles = suffixesByRole[file.role ?? ""];
    const kind = roleClassKind(file);

    return {
      Program(node) {
        if (
          allowedFiles &&
          file.base !== "types" &&
          !allowedFiles.some((suffix) => file.base.endsWith(suffix))
        ) {
          context.report({
            node,
            messageId: "file",
            data: {
              role: file.role,
              allowed: ["types.ts"]
                .concat(allowedFiles.map((suffix) => `<name>${suffix}.ts`))
                .join(" or "),
            },
          });
        }
      },
      ClassDeclaration(node: ClassDeclaration) {
        if (!kind) {
          return;
        }

        const name = node.id?.name ?? "";
        if (
          !name.endsWith(kind) ||
          name.toLowerCase() !== file.base.replaceAll("-", "")
        ) {
          context.report({
            node,
            messageId: "className",
            data: { file: file.file, suffix: kind },
          });
        }

        if (kind === "Service") {
          const interfaces = (node.implements ?? []).map(
            (item) => item.expression?.name ?? "",
          );
          if (!interfaces.some((item) => item.endsWith("ServiceInterface"))) {
            context.report({ node, messageId: "interface" });
          }
        }
        if ((kind === "Logic" || kind === "Plugin") && !node.superClass) {
          context.report({
            node,
            messageId: "base",
            data: {
              kind,
              base: kind === "Logic" ? "Logic" : "LogicPlugin",
            },
          });
        }
      },
    };
  },
};

export const constructorDeps: Rule<ArchitectureOptions> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Service, Storage, and Logic constructors take their dependencies as one `deps` parameter.",
    },
    schema: [{ type: "object" }],
    messages: {
      deps:
        "A {{kind}} constructor takes one parameter named `deps`. " +
        DOC +
        " (Application setup).",
      field:
        "A {{kind}} class declares its dependencies as `private readonly deps`. " +
        DOC +
        " (Application setup).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    const kind = file ? roleClassKind(file) : null;
    if (
      !file ||
      !kind ||
      file.isTest ||
      (options.exemptFeatures ?? []).includes(file.feature)
    ) {
      return {};
    }

    return {
      MethodDefinition(node: MethodDefinition) {
        if (node.kind !== "constructor") {
          return;
        }

        const params = node.value.params;
        const [param] = params;
        if (!param) {
          return;
        }
        const isProperty = param.type === "TSParameterProperty";
        const name = isProperty ? param.parameter?.name : param.name;
        if (params.length > 1 || name !== "deps") {
          context.report({ node, messageId: "deps", data: { kind } });
          return;
        }

        const ownsDeps = kind === "Service" || kind === "Storage";
        if (
          ownsDeps &&
          !(isProperty && param.accessibility === "private" && param.readonly)
        ) {
          context.report({ node, messageId: "field", data: { kind } });
        }
      },
    };
  },
};

export const fileLayout: Rule<ArchitectureOptions> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Every source file lives in a known role directory of a feature.",
    },
    schema: [{ type: "object" }],
    messages: {
      outside:
        "Source files live in src/features/<feature>/<role>/. " +
        DOC +
        " (Layout of src/).",
      featureRoot:
        "Only {{allowed}} may sit directly in a feature directory. Put this file in a role directory. " +
        DOC +
        " (Layout of src/).",
      role:
        "'{{role}}' is not a known role directory for the '{{feature}}' feature. Known: {{allowed}}. " +
        DOC +
        " (File organization).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (!file) {
      return {};
    }

    return {
      Program(node) {
        if (!file.feature) {
          const allowed = (options.srcRootFiles ?? []).concat(
            projectOptions.srcRootFiles,
          );
          if (!allowed.includes(file.inSrc)) {
            context.report({ node, messageId: "outside" });
          }
          return;
        }

        if (!file.role) {
          const allowed = (options.featureRootFiles ?? []).concat(
            options.featureRootFilesByFeature?.[file.feature] ?? [],
          );
          if (!allowed.includes(file.base)) {
            context.report({
              node,
              messageId: "featureRoot",
              data: { allowed: allowed.map((name) => `${name}.ts`).join(", ") },
            });
          }
          return;
        }

        const allowed = (options.roles ?? []).concat(
          options.rolesByFeature?.[file.feature] ?? [],
          projectOptions.roles,
          projectOptions.rolesByFeature[file.feature] ?? [],
        );
        if (!allowed.includes(file.role)) {
          context.report({
            node,
            messageId: "role",
            data: {
              role: file.role,
              feature: file.feature,
              allowed: allowed.join(", "),
            },
          });
        }
      },
    };
  },
};

const isTransactionCall = (node: CallExpression) =>
  isDepsMember(node.callee, "transaction");

/** True for `this.deps.<name>`. */
function isDepsMember(node: AstNode, name: string): boolean {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property?.name === name &&
    node.object?.type === "MemberExpression" &&
    node.object.object?.type === "ThisExpression" &&
    node.object.property?.name === "deps"
  );
}

export const transactionScope: Rule<ArchitectureOptions> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Inside a transaction, a Logic class uses the Storage that the transaction provides.",
    },
    schema: [],
    messages: {
      outside:
        "Inside a transaction, use the Storage that the callback receives. `this.deps.storage` is not part of the transaction. " +
        "See docs/agents/database.md (Transactions).",
    },
  },
  create(context) {
    let enclosingTransactionCalls = 0;

    return {
      CallExpression(node: CallExpression) {
        if (isTransactionCall(node)) {
          enclosingTransactionCalls += 1;
        }
      },
      "CallExpression:exit"(node: CallExpression) {
        if (isTransactionCall(node)) {
          enclosingTransactionCalls -= 1;
        }
      },
      MemberExpression(node: MemberExpression) {
        if (enclosingTransactionCalls > 0 && isDepsMember(node, "storage")) {
          context.report({ node, messageId: "outside" });
        }
      },
    };
  },
};
