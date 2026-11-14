/**
 * Lint rules for the class roles, feature layout, and dependency direction in
 * docs/agents/code-architecture.md. They use the standard ESLint rule API, so
 * oxlint (through `jsPlugins`) and ESLint can both load this plugin.
 *
 * These rules describe the architecture's shape. Rules about specific
 * technology choices live in stack-plugin.ts.
 */
import type { Plugin } from "./plugin-types.ts";
import {
  featureBoundaries,
  handlerDependencies,
  layerImports,
  noConstruction,
  ownStorage,
  serviceImplementations,
} from "./architecture-imports.ts";
import {
  constructorDeps,
  fileLayout,
  roleNaming,
  transactionScope,
} from "./architecture-layout.ts";

const plugin: Plugin = {
  meta: { name: "architecture" },
  rules: {
    "feature-boundaries": featureBoundaries,
    "layer-imports": layerImports,
    "service-implementations": serviceImplementations,
    "no-construction": noConstruction,
    "own-storage": ownStorage,
    "handler-dependencies": handlerDependencies,
    "role-naming": roleNaming,
    "constructor-deps": constructorDeps,
    "file-layout": fileLayout,
    "transaction-scope": transactionScope,
  },
};

export default plugin;
