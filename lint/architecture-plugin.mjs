/**
 * Lint rules for the class roles, feature layout, and dependency direction in
 * docs/agents/code-architecture.md. They use the standard ESLint rule API, so
 * oxlint (through `jsPlugins`) and ESLint can both load this plugin.
 *
 * These rules describe the architecture's shape. Rules about specific
 * technology choices live in stack-plugin.mjs.
 */
import {
  camelCase,
  describeFile,
  importVisitors,
  isListed,
  resolveImport,
} from "./paths.mjs";

const DOC = "See docs/agents/code-architecture.md";
const LAYER_ROLES = ["services", "storage", "logic", "ui", "handlers"];

function currentFile(context) {
  return describeFile(context.filename ?? context.getFilename());
}

function importedFile(context, source) {
  const target = resolveImport(
    context.filename ?? context.getFilename(),
    source,
  );
  return target ? describeFile(target) : null;
}

function isCompositionFile(file, options) {
  return isListed(file, options.compositionFiles ?? []);
}

function roleClassKind(file) {
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

const featureBoundaries = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A feature imports another feature only through its types.ts files.",
    },
    schema: [{ type: "object" }],
    messages: {
      private:
        "'{{target}}' is private to the '{{feature}}' feature. Import its types.ts, move shared code to a shared feature, or use an event. " +
        DOC +
        " (Dependency flow).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (!file?.feature || file.isTest || isCompositionFile(file, options)) {
      return {};
    }

    return importVisitors((node, source) => {
      const target = importedFile(context, source);
      if (
        !target?.feature ||
        target.workspace !== file.workspace ||
        target.feature === file.feature ||
        (options.sharedFeatures ?? []).includes(target.feature) ||
        target.base === "types"
      ) {
        return;
      }
      context.report({
        node,
        messageId: "private",
        data: { target: target.inSrc, feature: target.feature },
      });
    });
  },
};

const layerImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Storage and Service classes depend on no other layer and on no Service except a Core Service, and Logic classes do not import each other.",
    },
    schema: [{ type: "object" }],
    messages: {
      layer:
        "A file in {{from}}/ must not import from {{to}}/. " +
        DOC +
        " (Dependency flow).",
      service:
        "A file in {{from}}/ may depend on a Service of another feature only when it is a Core Service. Coordinate other Services in a Logic class. " +
        DOC +
        " (Class roles).",
      collections:
        "A file in {{from}}/ must not use the App's Storage, Service, or Logic collections. " +
        DOC +
        " (Dependency flow).",
      logic:
        "A Logic class must not import another Logic class. Use an event or a LogicPlugin. " +
        DOC +
        " (Dependency flow).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (!file?.feature || file.isTest) {
      return {};
    }

    const isolated = file.role === "storage" || file.role === "services";
    return importVisitors((node, source, names) => {
      const target = importedFile(context, source);
      if (!target?.feature) {
        return;
      }

      if (isolated && isListed(target, options.collectionTypeFiles ?? [])) {
        context.report({
          node,
          messageId: "collections",
          data: { from: file.role },
        });
        return;
      }
      // A Service must not depend on a second Service of its own feature
      // either. This rule cannot check that, because the feature's `types.ts`
      // has that interface beside the one that the class implements.
      if (
        isolated &&
        target.feature !== file.feature &&
        !(options.coreServiceFeatures ?? []).includes(target.feature) &&
        (names ?? []).some((name) => name?.endsWith("ServiceInterface"))
      ) {
        context.report({
          node,
          messageId: "service",
          data: { from: file.role },
        });
        return;
      }
      if (
        isolated &&
        target.base !== "types" &&
        target.role !== file.role &&
        LAYER_ROLES.includes(target.role)
      ) {
        context.report({
          node,
          messageId: "layer",
          data: { from: file.role, to: target.role },
        });
        return;
      }
      if (file.base.endsWith("-logic") && target.base.endsWith("-logic")) {
        context.report({ node, messageId: "logic" });
      }
    });
  },
};

const serviceImplementations = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only composition roots and tests import a Service implementation; other code depends on its interface.",
    },
    schema: [{ type: "object" }],
    messages: {
      implementation:
        "Import the Service's interface from types.ts instead of its implementation '{{target}}'. Only composition roots construct Services. " +
        DOC +
        " (Application setup).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (!file || file.isTest || isCompositionFile(file, options)) {
      return {};
    }

    return importVisitors((node, source) => {
      const target = importedFile(context, source);
      if (target?.role === "services" && target.base !== "types") {
        context.report({
          node,
          messageId: "implementation",
          data: { target: target.inSrc },
        });
      }
    });
  },
};

const noConstruction = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only composition roots construct Service, Storage, and Logic instances.",
    },
    schema: [{ type: "object" }],
    messages: {
      construct:
        "Do not construct '{{name}}' here. Composition roots construct Services, Storage, and backend Logic; the owning hook constructs UI Logic. " +
        DOC +
        " (Application setup).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (!file || file.isTest || isCompositionFile(file, options)) {
      return {};
    }

    return {
      NewExpression(node) {
        const name = node.callee.type === "Identifier" ? node.callee.name : "";
        if (/(?:Service|Storage|Logic)$/.test(name)) {
          context.report({ node, messageId: "construct", data: { name } });
        }
      },
    };
  },
};

const ownStorage = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A Logic class may use any feature's Service, but only its own feature's Storage.",
    },
    schema: [{ type: "object" }],
    messages: {
      foreign:
        "Storage '{{key}}' belongs to another feature. Logic in '{{feature}}' may use only Storage whose key starts with '{{prefix}}'. " +
        DOC +
        " (Dependency flow).",
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

    const prefix = camelCase(file.feature);
    const storageKeys = (type) => {
      if (type?.type === "TSLiteralType") {
        return [type.literal.value];
      }
      if (type?.type === "TSUnionType") {
        return type.types.flatMap(storageKeys);
      }
      return [];
    };

    return {
      TSTypeReference(node) {
        if (!(options.propsTypes ?? []).includes(node.typeName?.name)) {
          return;
        }
        const typeArguments = node.typeArguments ?? node.typeParameters;
        for (const key of storageKeys(typeArguments?.params[0])) {
          if (typeof key === "string" && !key.startsWith(prefix)) {
            context.report({
              node,
              messageId: "foreign",
              data: { key, feature: file.feature, prefix },
            });
          }
        }
      },
    };
  },
};

const roleNaming = {
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

    const allowedFiles = {
      services: ["-service"],
      storage: ["-storage"],
      logic: ["-logic", "-plugin"],
    }[file.role];
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
      ClassDeclaration(node) {
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

const constructorDeps = {
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
      !kind ||
      file.isTest ||
      (options.exemptFeatures ?? []).includes(file.feature)
    ) {
      return {};
    }

    return {
      MethodDefinition(node) {
        if (node.kind !== "constructor") {
          return;
        }

        const params = node.value.params;
        if (params.length === 0) {
          return;
        }
        const [param] = params;
        const isProperty = param.type === "TSParameterProperty";
        const name = isProperty ? param.parameter.name : param.name;
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

const fileLayout = {
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
          if (!(options.srcRootFiles ?? []).includes(file.inSrc)) {
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

/** True for `this.deps.<name>`. */
function isDepsMember(node, name) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.name === name &&
    node.object.type === "MemberExpression" &&
    node.object.object.type === "ThisExpression" &&
    node.object.property.name === "deps"
  );
}

const transactionScope = {
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
        DOC +
        " (Transactions).",
    },
  },
  create(context) {
    let enclosingTransactionCalls = 0;
    const isTransactionCall = (node) =>
      isDepsMember(node.callee, "transaction");

    return {
      CallExpression(node) {
        if (isTransactionCall(node)) {
          enclosingTransactionCalls += 1;
        }
      },
      "CallExpression:exit"(node) {
        if (isTransactionCall(node)) {
          enclosingTransactionCalls -= 1;
        }
      },
      MemberExpression(node) {
        if (enclosingTransactionCalls > 0 && isDepsMember(node, "storage")) {
          context.report({ node, messageId: "outside" });
        }
      },
    };
  },
};

export default {
  meta: { name: "architecture" },
  rules: {
    "feature-boundaries": featureBoundaries,
    "layer-imports": layerImports,
    "service-implementations": serviceImplementations,
    "no-construction": noConstruction,
    "own-storage": ownStorage,
    "role-naming": roleNaming,
    "constructor-deps": constructorDeps,
    "file-layout": fileLayout,
    "transaction-scope": transactionScope,
  },
};
