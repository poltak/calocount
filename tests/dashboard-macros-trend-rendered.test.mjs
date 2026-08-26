import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard renders an accessible seven-day macros trend", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /calculateMacroTrend/);
  assert.match(page, /id="macro-trend-title">Macros trend/);
  assert.match(page, /Calorie-weighted carbohydrate, protein, and fat split for the past seven days/);
  assert.match(page, /day\.percentages\.carbs/);
  assert.match(page, /day\.percentages\.protein/);
  assert.match(page, /day\.percentages\.fat/);
  assert.match(page, /No macro records for the past seven days/);
  assert.match(css, /\.macro-trend-bars/);
  assert.match(css, /\.macro-segment\.carbs \{ background: var\(--blue\); \}/);
  assert.match(css, /\.macro-segment\.protein \{ background: var\(--green\); \}/);
  assert.match(css, /\.macro-segment\.fat \{ background: var\(--orange\); \}/);
});
