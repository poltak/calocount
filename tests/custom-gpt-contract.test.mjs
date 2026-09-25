import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const instructionsPath = new URL("../docs/custom-gpt/instructions.md", import.meta.url);
const schemaPath = new URL("../docs/custom-gpt/action-schema.yaml", import.meta.url);

// Keep the deprecated Action templates valid for existing clients.
test("Custom GPT instructions fit the editor limit and preserve logging rules", async () => {
  const instructions = await readFile(instructionsPath, "utf8");

  assert.ok(instructions.length < 8_000);
  for (const requiredText of [
    "do not split omega-3 into ALA, EPA, or DHA",
    "without a second confirmation",
    "YOUR_DEFAULT_IANA_TIMEZONE",
    "openaiFileIdRefs",
    "one new UUID per meal",
    "daily_totals.kcal",
    "API authentication secret",
  ]) {
    assert.match(instructions, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Custom GPT action uses an editor-compatible batch request schema", async () => {
  const schema = await readFile(schemaPath, "utf8");
  const description = schema.match(/^\x20{6}description:\s*(.+)$/m)?.[1];
  assert.ok(description);
  assert.ok(description.length <= 300);

  const requestBody = schema.match(/^\x20{6}requestBody:\n([\s\S]*?)^\x20{6}responses:/m)?.[1];
  assert.ok(requestBody);
  assert.match(requestBody, /^\x20{12}schema:\s*$/m);
  assert.match(requestBody, /^\x20{14}type: object\s*$/m);
  assert.doesNotMatch(requestBody, /^\x20{14}oneOf:/m);
  assert.match(requestBody, /^\x20{14}required:\n\x20{16}- meals\s*$/m);
  assert.match(requestBody, /^\x20{16}meals:\n\x20{18}type: array\s*$/m);
  assert.match(requestBody, /^\x20{18}maxItems: 20\s*$/m);
});
