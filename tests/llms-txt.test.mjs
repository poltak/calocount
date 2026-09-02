import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function phrasePattern(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\s+/g, "\\s+"));
}

test("llms.txt documents the canonical public dashboard projection", async () => {
  const content = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");

  assert.match(content, /^# Calocount$/m);
  assert.match(content, /> Public, read-only nutrition dashboard for agents\./);
  assert.match(content, /`\/api\/public\/summary`/);
  assert.match(content, /canonical source for the public dashboard projection/);
  for (const category of [
    "calorie, protein, and nutrient targets",
    "today's calories",
    "seven-day totals, averages, and daily trend points",
    "nutrition totals",
    "recent completed meals",
    "recent weights",
  ]) assert.match(content, phrasePattern(category));
  assert.match(content, /Dates use the public dashboard's UTC day boundary\./);
  assert.match(content, /`hasPhoto: true`[\s\S]*`\/meal-photos\/\{mealId\}`/);
  assert.match(content, /using that meal's `id` for `\{mealId\}`/);
  assert.match(content, /omits private fields and systems/);
  for (const privateField of [
    "owner identifiers and keys",
    "captions",
    "notes",
    "photo storage keys and MIME metadata",
    "AI/provider data",
    "Telegram data",
    "private settings",
    "exports",
    "API credentials",
  ]) assert.match(content, phrasePattern(privateField));
  assert.match(content, /contains no live dashboard data/);
});

test("llms.txt does not advertise owner or private API routes", async () => {
  const content = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");
  const apiPaths = [...content.matchAll(/\/api\/[A-Za-z0-9_./{}-]+/g)].map(([path]) => path);

  assert.ok(apiPaths.length > 0);
  assert.ok(apiPaths.every((path) => path === "/api/public/summary"));
  assert.doesNotMatch(content, /\/(?:owner|api\/photos)(?:[\s`/)]|$)/);
  assert.doesNotMatch(content, /<(?:html|body|script|main)(?:\s|>)/i);
});
