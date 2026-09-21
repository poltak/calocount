import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the owner dashboard exposes curatable saved entries", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Saved entries/);
  assert.match(page, /No saved entries yet/);
  assert.match(page, /Add to saved entries/);
  assert.match(page, /Track now/);
  assert.match(page, /removeFromSavedEntries/);
  assert.match(page, /entry\.id === meal\.savedEntryId/);
  assert.match(page, /\/api\/saved-entries/);
  assert.match(css, /\.saved-entry-row/);
  assert.match(css, /\.saved-entries-panel \{[\s\S]*?padding: 21px;/);
  assert.match(css, /\.saved-entry-list \{[\s\S]*?border-top: 1px solid var\(--line-soft\)/);
});

test("the dashboard uses entry terminology in user-facing controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, />Entries</);
  assert.match(page, /Add entry/);
  assert.match(page, /Log an entry/);
  assert.match(page, /Save entry/);
  assert.match(page, /No entries logged/);
});

test("compact dashboard panels precede the side-by-side saved and daily entries", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const panelOrder = ["weight-panel", "macro-panel", "history-panel", "saved-entries-panel", "meals-panel"]
    .map((className) => page.indexOf(className));
  assert.ok(panelOrder.every((position) => position >= 0));
  assert.deepEqual(panelOrder, [...panelOrder].sort((left, right) => left - right));
  assert.match(css, /\.content-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.compact-dashboard-panel \{ min-height: 291px; \}/);
  assert.match(css, /\.weight-reading \{[\s\S]*?align-items: center;/);
  assert.match(css, /\.macro-panel \{[\s\S]*?grid-template-rows: auto 1fr;/);
  assert.match(css, /\.meals-panel \{ grid-column: span 2; \}/);
  assert.match(page, /className="entries-estimate-note"/);
  assert.doesNotMatch(page, /className="quick-tip"/);
});
