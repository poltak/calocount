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
// condition there, an event that skips the plan gets a failed check.
test("the verdict job skips each event that skips the plan", async () => {
  const workflow = await readFile(
    path.join(repoRoot, ".github/workflows/agent-review.yml"),
    "utf8",
  );
  const conditionOf = (job) =>
    workflow
      .slice(workflow.indexOf(`\n  ${job}:\n`))
      .match(/\n {4}if: ([^\n]+)\n/)[1];

  const plan = conditionOf("plan");
  assert.match(plan, /^vars\.AGENT_REVIEW != 'off' && /);
  assert.match(plan, /!github\.event\.pull_request\.draft/);
  assert.match(plan, /'renovate\[bot\]'/);
  assert.match(plan, /'dependabot\[bot\]'/);
  assert.ok(
    conditionOf("verdict").startsWith(`always() && ${plan} && (`),
    conditionOf("verdict"),
  );
});
