import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal actions stay visible below macros and wrap on small screens", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.ok(page.indexOf('className="meal-actions"') > page.indexOf('className="meal-macros"'));
  assert.match(page, /!readOnly \? <div className="meal-actions"/);
  assert.doesNotMatch(page, /meal-actions-toggle|handleMealPointerDown/);
  const actionsRule = css.slice(css.indexOf(".meal-actions {")).split("}")[0];
  assert.match(actionsRule, /flex-wrap: wrap;/);
  assert.doesNotMatch(actionsRule, /position: absolute|visibility: hidden/);
  assert.match(css, /\.meal-actions button \{ min-height: 44px; \}/);
});
