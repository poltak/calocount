import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readRepositoryFile = (file) =>
  readFile(path.join(repoRoot, file), "utf8");

test("only database.md has rules that depend on the database", async () => {
  const architecture = await readRepositoryFile(
    "docs/agents/code-architecture.md",
  );

  assert.doesNotMatch(
    architecture,
    /postgres|pglite|kysely|migration|transaction/i,
  );
});

test("the template owns database.md, and each reader finds it", async () => {
  const { templateOwned } = JSON.parse(
    await readRepositoryFile("scripts/template-paths.json"),
  );

  assert.ok(templateOwned.includes("docs/agents/database.md"));
  assert.match(
    await readRepositoryFile("AGENTS.md"),
    /\(docs\/agents\/database\.md\)/,
  );
  assert.match(
    await readRepositoryFile("docs/agents/README.md"),
    /\(database\.md\)/,
  );
  assert.match(
    await readRepositoryFile(".agents/review/prompt.md"),
    /docs\/agents\/database\.md/,
  );
});
