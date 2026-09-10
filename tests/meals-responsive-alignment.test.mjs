import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal rows keep readable text and aligned macros in a compact table layout", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["Energy", "Protein", "Carbs", "Fat"]) {
    assert.ok(page.includes(`className="meal-stat-label">${label}</span>`));
  }
  assert.match(page, /meal\.description\.trim\(\)\.toLocaleLowerCase\(\) !== meal\.name\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(css, /\.meal-list \{[^}]*border-top: 1px solid var\(--line-soft\);/);
  assert.match(css, /\.meal-row-content \{[^}]*grid-template-columns: 42px minmax\(170px, 1fr\) repeat\(4, minmax\(58px, 72px\)\)/);
  assert.match(css, /\.meal-macros \{ display: contents; \}/);
  assert.match(css, /\.meal-stat \{[^}]*text-align: left;/);
  for (const selector of [".meal-name-line strong", ".meal-info > span"]) {
    const rule = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
    assert.match(rule, /overflow-wrap: anywhere;/);
    assert.doesNotMatch(rule, /ellipsis|nowrap|overflow: hidden/);
  }
});
