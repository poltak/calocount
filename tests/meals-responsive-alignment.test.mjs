import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile meal macro labels use the same left edge as their values", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 620px)"));

  assert.match(page, /data-label="Energy"/);
  assert.match(page, /data-label="Protein"/);
  assert.match(page, /data-label="Carbs"/);
  assert.match(page, /data-label="Fat"/);

  const mobileMealStatRule = mobileCss.match(/\.meal-stat \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(mobileMealStatRule, /text-align:\s*left;/);
});
