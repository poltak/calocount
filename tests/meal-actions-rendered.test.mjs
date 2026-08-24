import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal actions use a compact accessible toggle and swipe-ready mobile row", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 620px)"));

  assert.match(page, /className="meal-row-content"/);
  assert.match(page, /onPointerDown=\{\(event\) => handleMealPointerDown\(meal\.id, event\)\}/);
  assert.match(page, /onPointerCancel=\{\(event\) => cancelMealPointer\(meal\.id, event\)\}/);
  assert.match(page, /className="meal-actions-toggle"/);
  assert.match(page, /aria-controls=\{`meal-actions-\$\{meal\.id\}`\}/);

  assert.match(css, /\.meal-row-content \{ display: contents; \}/);
  assert.match(mobileCss, /\.meal-row \{[\s\S]*?display: block;[\s\S]*?overflow: hidden;/);
  assert.match(mobileCss, /\.meal-row-content \{[\s\S]*?grid-template-columns: 35px repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?touch-action: pan-y;/);
  assert.match(mobileCss, /\.meal-actions \{[\s\S]*?position: absolute;[\s\S]*?visibility: hidden;/);
  assert.match(css, /\.meal-row\.is-actions-open \.meal-actions \{ visibility: visible; \}/);
  assert.doesNotMatch(mobileCss, /\.meal-row \{[\s\S]*?grid-template-columns:[^}]*minmax\(68px, auto\)/);
});
