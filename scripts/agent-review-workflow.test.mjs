import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// The verdict job fails when the plan did not succeed. Without the same
// condition there, a repository that turns the review off gets a failed check.
test("the plan and the verdict jobs both stop when AGENT_REVIEW is off", async () => {
  const workflow = await readFile(
    path.join(repoRoot, ".github/workflows/agent-review.yml"),
    "utf8",
  );
  const conditionOf = (job) =>
    workflow
      .slice(workflow.indexOf(`\n  ${job}:\n`))
      .match(/\n {4}if: ([^\n]+)\n/)[1];

  assert.equal(conditionOf("plan"), "vars.AGENT_REVIEW != 'off'");
  assert.match(
    conditionOf("verdict"),
    /^always\(\) && vars\.AGENT_REVIEW != 'off' && \(/,
  );
});
