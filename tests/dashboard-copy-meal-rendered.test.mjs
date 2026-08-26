import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("previous-day meals expose a duplicate-safe copy-to-today action", async () => {
  const [page, css, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meals/[id]/copy/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /async function copyMealToToday\(mealId: string\)/);
  assert.match(page, /mealCopyInFlight/);
  assert.match(page, /selectedDay\.date !== days\.at\(-1\)\?\.date/);
  assert.match(page, /\/api\/meals\/\$\{encodeURIComponent\(mealId\)\}\/copy/);
  assert.match(page, /Copy to today/);
  assert.match(page, /aria-label=\{`Copy \$\{meal\.name\} to today`\}/);
  assert.match(css, /\.meal-row\.has-copy-action\.is-actions-open \.meal-row-content \{ transform: translateX\(-190px\); \}/);
  assert.match(route, /export async function POST/);
  assert.match(route, /copyMeal/);
});
