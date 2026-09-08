import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal cards wrap full text and align macro labels with their values at every width", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["Energy", "Protein", "Carbs", "Fat"]) {
    assert.ok(page.includes(`className="meal-stat-label">${label}</span>`));
  }
  assert.match(css, /\.meal-macros \{[^}]*grid-column: 1 \/ -1;[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.meal-stat \{[^}]*text-align: left;/);
  for (const selector of [".meal-name-line strong", ".meal-info > span"]) {
    const rule = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
    assert.match(rule, /overflow-wrap: anywhere;/);
    assert.doesNotMatch(rule, /ellipsis|nowrap|overflow: hidden/);
  }
});
