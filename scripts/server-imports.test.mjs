// A server must not load a migration. See docs/agents/decisions.md. Nothing
// fails at run time when one import brings them back, so this test reads the
// imports of the server's source files.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const features = fileURLToPath(
  new URL("../backend/src/features/", import.meta.url),
);
const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?"(\.[^"]+)"|import\(\s*"(\.[^"]+)"\s*\)/g;

/** Each source file that a file loads at run time, also through other files. */
async function loadedFrom(start) {
  const loaded = new Set();
  const pending = [start];
  while (pending.length > 0) {
    const file = pending.pop();
    if (loaded.has(file)) {
      continue;
    }
    loaded.add(file);
    const source = await readFile(file, "utf8");
    for (const [, statement, call] of source.matchAll(IMPORT)) {
      pending.push(
        path
          .resolve(path.dirname(file), statement ?? call)
          .replace(/\.js$/, ".ts"),
      );
    }
  }
  return [...loaded].map((file) => path.relative(features, file));
}

test("the server does not load a migration", async () => {
  const loaded = await loadedFrom(path.join(features, "core/server/worker.ts"));
  assert.ok(
    loaded.includes("core/compose-app.ts"),
    "The test must follow the imports of the server",
  );
  assert.deepEqual(
    loaded.filter((file) => /^core\/database\/migrations\b/.test(file)),
    [],
  );
});
