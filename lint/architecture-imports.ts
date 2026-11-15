// Architecture rules about imports, feature boundaries, and what each role may use.
import {
  camelCase,
  describeFile,
  importVisitors,
  isListed,
  resolveImport,
} from "./paths.ts";
import type { FileDescription } from "./paths.ts";
import type {
  ArchitectureOptions,
  AstNode,
  ClassDeclaration,
  NewExpression,
  Lookup,
  Node,
  Rule,
  RuleContext,
  TypeReference,
} from "./plugin-types.ts";
import { projectOptions } from "./project-options.ts";
import { DOC, currentFile } from "./architecture-shared.ts";

const LAYER_ROLES: Lookup = ["services", "storage", "logic", "ui", "handlers"];

function importedFile(
  context: RuleContext,
  source: string,
): FileDescription | null {
  const target = resolveImport(
    context.filename ?? context.getFilename(),
    source,
  );
  return target ? describeFile(target) : null;
}

function isCompositionFile(
  file: FileDescription,
  options: ArchitectureOptions,
): boolean {
  return isListed(file, [
    ...(options.compositionFiles ?? []),
    ...projectOptions.compositionFiles,
  ]);
}

const startOf = (node: Node | undefined) => node?.range?.[0] ?? node?.start;

/** The string keys of `"a"` or `"a" | "b"`, as in the second argument of a `Pick`. */
function literalKeys(type: AstNode | undefined): unknown[] {
  if (type?.type === "TSLiteralType") {
    return [type.literal?.value];
  }
  if (type?.type === "TSUnionType") {
    return (type.types ?? []).flatMap(literalKeys);
  }
  return [];
}

export const featureBoundaries: Rule<ArchitectureOptions> = {
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
      sharedFeature:
        "'{{feature}}' is a shared feature of this project, so it imports only {{allowed}}. " +
        DOC +
        " (Layout of src/).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (!file?.feature || file.isTest || isCompositionFile(file, options)) {
      return {};
    }

    const shared = options.sharedFeatures ?? [];
    const feature = file.feature;
    return importVisitors((node, source) => {
      const target = importedFile(context, source);
      if (
        !target?.feature ||
        target.workspace !== file.workspace ||
        target.feature === file.feature ||
        // Black box tests follow a workflow across features, so they may use
        // the page objects of every feature.
        (target.role === file.role &&
          (options.sharedRoles ?? []).includes(file.role))
      ) {
        return;
      }
      // Other features import a project's shared feature, so an import from it
      // can start a cycle. This also keeps the boundaries when a project lists
      // each feature.
      if (projectOptions.sharedFeatures.includes(feature)) {
        if (!shared.includes(target.feature)) {
          context.report({
            node,
            messageId: "sharedFeature",
            data: { feature: file.feature, allowed: shared.join(", ") },
          });
        }
        return;
      }
      if (
        shared.includes(target.feature) ||
        projectOptions.sharedFeatures.includes(target.feature) ||
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

export const layerImports: Rule<ArchitectureOptions> = {
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
      ownService:
        "A file in {{from}}/ must not depend on '{{name}}', a Service of its own feature that it does not implement. Coordinate Services in a Logic class. " +
        DOC +
        " (Dependency flow).",
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
    const ownFeatureServices: { node: Node; name: string }[] = [];
    const implemented = new Set<string | undefined>();
    const imports = importVisitors((node, source, names) => {
      const target = importedFile(context, source);
      if (!target?.feature) {
        return;
      }

      if (
        isolated &&
        file.base !== "types" &&
        target.feature === file.feature
      ) {
        for (const name of names ?? []) {
          if (name?.endsWith("ServiceInterface")) {
            ownFeatureServices.push({ node, name });
          }
        }
      }
      if (isolated && isListed(target, options.collectionTypeFiles ?? [])) {
        context.report({
          node,
          messageId: "collections",
          data: { from: file.role },
        });
        return;
      }
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

    return {
      ...imports,
      ClassDeclaration(node: ClassDeclaration) {
        for (const item of node.implements ?? []) {
          implemented.add(item.expression?.name);
        }
      },
      // A Service file imports the interface that its class implements from
      // the same `types.ts` as a second Service's interface. Only the class
      // tells the two apart, so the check waits for the whole file.
      "Program:exit"() {
        for (const { node, name } of ownFeatureServices) {
          if (!implemented.has(name)) {
            context.report({
              node,
              messageId: "ownService",
              data: { from: file.role, name },
            });
          }
        }
      },
    };
  },
};

export const serviceImplementations: Rule<ArchitectureOptions> = {
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

export const noConstruction: Rule<ArchitectureOptions> = {
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
      NewExpression(node: NewExpression) {
        const name =
          node.callee.type === "Identifier" ? (node.callee.name ?? "") : "";
        if (/(?:Service|Storage|Logic)$/.test(name)) {
          context.report({ node, messageId: "construct", data: { name } });
        }
      },
    };
  },
};

export const ownStorage: Rule<ArchitectureOptions> = {
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

    return {
      TSTypeReference(node: TypeReference) {
        if (!(options.propsTypes ?? []).includes(node.typeName?.name)) {
          return;
        }
        const typeArguments = node.typeArguments ?? node.typeParameters;
        for (const key of literalKeys(typeArguments?.params[0])) {
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

export const handlerDependencies: Rule<ArchitectureOptions> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A handler calls backend Logic. It takes no Storage, and no Service except a Core Service.",
    },
    schema: [{ type: "object" }],
    messages: {
      service:
        "A handler must not use the Service '{{key}}'. Call a backend Logic class, which uses the Service. " +
        DOC +
        " (Backend handlers).",
      collection:
        "A handler must not take '{{name}}'. Select the Logic classes that it calls with Pick<BackendLogic, ...>. " +
        DOC +
        " (Backend handlers).",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const file = currentFile(context);
    if (file?.role !== "handlers" || file.isTest) {
      return {};
    }

    const serviceCollections = options.serviceCollections ?? [];
    const storageCollections = options.storageCollections ?? [];
    const readsSession = isListed(file, options.sessionFiles ?? []);
    // A `Pick` records where its Service collection starts. The visitor
    // reaches that collection next, and must not report it as a whole one.
    const pickedAt = new Set();

    return {
      TSTypeReference(node: TypeReference) {
        const name = node.typeName?.name;
        if (storageCollections.includes(name)) {
          context.report({ node, messageId: "collection", data: { name } });
          return;
        }
        if (readsSession) {
          return;
        }

        if (name === "Pick") {
          const typeArguments = node.typeArguments ?? node.typeParameters;
          const [collection, keys] = typeArguments?.params ?? [];
          if (!serviceCollections.includes(collection?.typeName?.name)) {
            return;
          }
          pickedAt.add(startOf(collection));
          for (const key of literalKeys(keys)) {
            if (
              !(options.coreServices ?? []).some((service) => service === key)
            ) {
              context.report({ node, messageId: "service", data: { key } });
            }
          }
          return;
        }
        if (serviceCollections.includes(name) && !pickedAt.has(startOf(node))) {
          context.report({ node, messageId: "collection", data: { name } });
        }
      },
    };
  },
};
