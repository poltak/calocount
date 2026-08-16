import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const route = await readFile(new URL("../app/api/ai-profiles/route.ts", import.meta.url), "utf8");

test("AI profile API keeps provider selection bounded", () => {
  assert.match(route, /openrouter/);
  assert.match(route, /xai/);
  assert.match(route, /fallbackModels/);
  assert.match(route, /maxInputPrice/);
  assert.match(route, /maxOutputPrice/);
});
test("AI profile API rejects API keys in request bodies", () => {
  assert.match(route, /api_key_not_allowed/);
  assert.match(route, /openrouterApiKey/);
  assert.match(route, /xaiApiKey/);
});
