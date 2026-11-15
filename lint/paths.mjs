import path from "node:path";

const SOURCE_EXTENSION = /\.(?:d\.)?[cm]?[jt]sx?$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

/**
 * Describe a file by its place in `<workspace>/src/features/<feature>/<role>/`.
 * Returns null for files outside a `src/` directory.
 */
export function describeFile(filename) {
  const normalized = filename.split(path.sep).join("/");
  const match = normalized.match(/^(.*)\/src\/(.*)$/);
  if (!match) {
    return null;
  }

  const [, workspace, inSrc] = match;
  const parts = inSrc.split("/");
  const file = parts.at(-1);
  const isTest = TEST_FILE.test(file);
  // `foo-logic.test.ts` and `foo-logic.ts` both have the base `foo-logic`.
  const base = file.replace(SOURCE_EXTENSION, "").replace(/\.test$/, "");
  const inFeature = parts[0] === "features" && parts.length >= 3;

  return {
    workspace,
    inSrc,
    file,
    base,
    isTest,
    feature: inFeature ? parts[1] : null,
    // A file directly inside the feature directory has no role.
    role: inFeature && parts.length > 3 ? parts[2] : null,
  };
}

/** Returns null for the import of a package. */
export function resolveImport(filename, source) {
  if (typeof source !== "string" || !source.startsWith(".")) {
    return null;
  }
  return path.resolve(path.dirname(filename), source);
}

/** The listed paths are relative to `src/`. */
/** An entry that ends with `/` lists each file in that directory. */
export function isListed(description, list) {
  const withoutExtension = description.inSrc.replace(SOURCE_EXTENSION, "");
  return list.some((entry) =>
    entry.endsWith("/")
      ? description.inSrc.startsWith(entry)
      : entry.replace(SOURCE_EXTENSION, "") === withoutExtension,
  );
}

export function camelCase(name) {
  return name.replace(/-([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
}

/**
 * Report every import in a file, including re-exports and dynamic imports.
 * `visit` receives the AST node, the import source, and the imported names
 * (null when the names are not listed, as in `import *` or `import()`).
 */
export function importVisitors(visit) {
  const names = (specifiers) =>
    specifiers.map(
      (specifier) => specifier.imported?.name ?? specifier.local?.name,
    );

  return {
    ImportDeclaration(node) {
      visit(node, node.source.value, names(node.specifiers));
    },
    ExportNamedDeclaration(node) {
      if (node.source) {
        visit(node, node.source.value, null);
      }
    },
    ExportAllDeclaration(node) {
      visit(node, node.source.value, null);
    },
    ImportExpression(node) {
      if (node.source.type === "Literal") {
        visit(node, node.source.value, null);
      }
    },
  };
}
