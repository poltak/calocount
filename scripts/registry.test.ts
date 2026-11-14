import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ui = "frontend/src/features/core/ui";

interface RegistryItem {
  name: string;
  type: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: { path: string; target?: string }[];
}

interface BuiltItem extends RegistryItem {
  files: { path: string; target?: string; content: string }[];
}

test("the registry builds every WorldBrain part from its source", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "worldbrain-registry-"));
  try {
    execFileSync("pnpm", ["exec", "shadcn", "build", "--output", output], {
      cwd: root,
      stdio: "pipe",
    });
    const registry = JSON.parse(
      await readFile(path.join(root, "registry.json"), "utf8"),
    ) as { items: RegistryItem[] };
    const sources = new Set<string>();
    for (const item of registry.items) {
      const built = JSON.parse(
        await readFile(path.join(output, `${item.name}.json`), "utf8"),
      ) as BuiltItem;
      assert.equal(built.name, item.name);
      assert.equal(built.type, item.type);
      assert.deepEqual(built.dependencies, item.dependencies);
      assert.deepEqual(built.registryDependencies, item.registryDependencies);
      assert.equal(built.files.length, item.files.length);
      for (const file of built.files) {
        sources.add(file.path);
        const source = item.files.find((entry) => entry.path === file.path);
        assert.ok(source);
        assert.equal(file.target, source.target);
        assert.equal(
          file.content,
          await readFile(path.join(root, file.path), "utf8"),
        );
      }
    }
    for (const layer of ["core", "registry"]) {
      for (const file of await readdir(path.join(root, ui, layer), {
        recursive: true,
      })) {
        if (/\.(tsx?|css)$/.test(file)) {
          assert.ok(sources.has(`${ui}/${layer}/${file}`), file);
        }
      }
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
