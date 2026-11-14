import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scriptFiles } from "./agent-review-fixtures.ts";

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
  const conditionOf = (job: string): string => {
    const condition = workflow
      .slice(workflow.indexOf(`\n  ${job}:\n`))
      .match(/\n {4}if: ([^\n]+)\n/)?.[1];
    assert.ok(condition, `${job} has no condition`);
    return condition;
  };

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

test("the plan step receives the review rules and configured maintainers", async () => {
  const workflow = await readFile(
    path.join(repoRoot, ".github/workflows/agent-review.yml"),
    "utf8",
  );
  const plan = workflow.slice(
    workflow.indexOf("\n  plan:\n"),
    workflow.indexOf("\n  claude:\n"),
  );
  assert.match(plan, /sparse-checkout: \|\n +scripts\n +\.agents\/review\n/);
  assert.match(
    plan,
    /run: node scripts\/agent-review\.ts plan\n        env:\n(?:          [^\n]+\n)*          TEMPLATE_MAINTAINERS: \$\{\{ vars\.TEMPLATE_MAINTAINERS \}\}/,
  );
});

// GitHub gives the verdict job only the outputs that a model job lists, so an
// output that the script writes and the job does not list is lost.
test("each model job of the workflow lists each output that the script writes", async () => {
  const script = (
    await Promise.all(
      (await scriptFiles()).map((file) =>
        readFile(path.join(repoRoot, file), "utf8"),
      ),
    )
  ).join("\n");
  const workflow = await readFile(
    path.join(repoRoot, ".github/workflows/agent-review.yml"),
    "utf8",
  );
  const written = new Set(
    [...script.matchAll(/writeOutputs\(\{([\s\S]*?)\}\);/g)]
      .flatMap(([, fields = ""]) => [...fields.matchAll(/(\w+)\s*[:,]/g)])
      .map(([, key]) => key)
      .filter((key) => key !== "mode" && key !== "earlier"),
  );
  assert.deepEqual([...written].sort(), [
    "findings",
    "message",
    "notes",
    "status",
    "statuses",
    "usage",
  ]);

  for (const job of ["claude", "codex"]) {
    const block = workflow.slice(
      workflow.indexOf(`\n  ${job}:\n`),
      workflow.indexOf("\n    steps:", workflow.indexOf(`\n  ${job}:\n`)),
    );
    const listed = [
      ...block.matchAll(
        /^ {6}(\w+): \$\{\{ steps\.review\.outputs\.(\w+) \}\}$/gm,
      ),
    ]
      .filter(([, key, output]) => key === output)
      .map(([, key]) => key);
    assert.deepEqual(listed.sort(), [...written].sort(), job);
  }
});
