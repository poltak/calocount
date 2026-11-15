// Run with pnpm run test:scripts after building the backend.
// The template has no eval, so each test supplies a small real definition.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
const compiled = new URL(
  "../backend/dist/features/core/scripts/eval-command.js",
  import.meta.url,
);
function run(t: TestContext, kind: string) {
  assert.ok(
    existsSync(compiled),
    "Run `pnpm --filter backend... run build` first.",
  );
  const dir = mkdtempSync(path.join(os.tmpdir(), "eval-verify-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, "eval.mjs");
  writeFileSync(
    script,
    `import { runEvalCommand } from ${JSON.stringify(compiled.href)};
const kind = ${JSON.stringify(kind)};
await runEvalCommand({
name: "tiny", dataDir: ${JSON.stringify(dir)}, privateData: false,
promptVersions: { main: "v1" }, roles: ["main"], defaultModels: { main: "unused" },
loadCases: () => [{ id: "first" }, { id: "second" }], check: () => [], estimate: () => 0,
run: async ({ ai }) => (await ai.generate({ purpose: "value", role: "main", system: "Return a value", content: [{ type: "text", text: "value" }], schema: { type: "number" }, maxTokens: 10 })).output,
answers: ({ mode, evalCase }) => ({ value: () => mode === "oracle" ? (kind === "bad-oracle" && evalCase.id === "second" ? 0 : 1) : (kind === "bad-null" ? 1 : 0) }),
score: ({ answer }) => answer.result,
results: { head: ["a", "b"], row: () => "", ...(kind === "missing-share" ? {} : { share: score => score }) }
}, ["verify"]);`,
  );
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  return { status: r.status, output: r.stdout + r.stderr };
}
test("verifies oracle and null through the model service", (t) => {
  const r = run(t, "correct");
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /oracle: 2 of 2 cases at 100%/);
  assert.match(r.output, /null: 2 of 2 cases at 0%/);
});
test("reports a wrong oracle case", (t) => {
  const r = run(t, "bad-oracle");
  assert.equal(r.status, 1);
  assert.match(r.output, /second: 0/);
});
test("refuses a null score above zero", (t) => {
  const r = run(t, "bad-null");
  assert.equal(r.status, 1);
  assert.match(r.output, /null: 0 of 2/);
});
test("requires results.share", (t) => {
  const r = run(t, "missing-share");
  assert.equal(r.status, 1);
  assert.match(r.output, /Add results.share/);
});
