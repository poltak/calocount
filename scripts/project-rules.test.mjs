import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PATHS_FILE, matchesPath } from "./template-files.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const PROJECT_RULES = "docs/agents/project/rules.md";

const readRepositoryFile = (file) =>
  readFile(path.join(repoRoot, file), "utf8");

test("AGENTS.md imports the project rules in a line that Claude Code expands", async () => {
  const lines = (await readRepositoryFile("AGENTS.md")).split("\n");

  const line = lines.find((text) => text.includes(`@${PROJECT_RULES}`));

  assert.ok(line, "AGENTS.md must name the project rules with an @ import.");
  // Claude Code does not expand an import in a code span or a code block.
  assert.doesNotMatch(line, /`/);
  const fence = lines.findIndex((text) => text.startsWith("```"));
  assert.ok(fence === -1 || lines.indexOf(line) < fence);
});

test("a sync and the guard leave the project's documents to the project", async () => {
  const { projectOwned, templateOwned } = JSON.parse(
    await readRepositoryFile(PATHS_FILE),
  );

  assert.ok(
    projectOwned.some((entry) => matchesPath({ entry, file: PROJECT_RULES })),
  );
  assert.ok(
    !templateOwned.some((entry) => matchesPath({ entry, file: PROJECT_RULES })),
  );
});
