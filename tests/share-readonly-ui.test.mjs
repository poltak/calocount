import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("share route renders the dashboard in read-only mode with its token", async () => {
  const route = await readFile(new URL("../app/share/[token]/page.tsx", import.meta.url), "utf8");

  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /<Dashboard readOnly shareToken=\{token\} \/>/);
});

test("shared dashboard reads only the share summary and strips photos", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /\/api\/share\/\$\{encodeURIComponent\(shareToken\)\}\/summary/);
  assert.match(page, /buildLiveDays\(parsed, !readOnly\)/);
  assert.match(page, /photoKey: includePhotos \? meal\.photoKey : null/);
  assert.match(page, /Shared read-only view — changes are disabled\./);
  assert.match(page, /Loading shared log/);
  assert.match(page, /Shared log unavailable/);
});

test("shared dashboard hides every mutation and protects handlers", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /if \(readOnly\) return;/);
  assert.match(page, /\{!readOnly \? <button className="primary-button"[^]*>[^]*Add meal/);
  assert.match(page, /\{!readOnly && showWeightForm \? <form className="weight-form"/);
  assert.match(page, /\{!readOnly \? <button\s+className="meal-actions-toggle"/);
  assert.match(page, /\{!readOnly \? <div className="meal-actions"/);
  assert.match(page, /\{!readOnly && editingMealId === meal\.id \?/);
  assert.match(page, /\{!readOnly && meal\.photoKey/);
  assert.match(page, /className="share-state" aria-live="polite"/);
  assert.match(page, /className="data-banner shared" role="status"/);
  assert.match(page, /aria-busy=\{shareRevokingId === link\.id\}/);
});

test("owner share controls use guarded create, list, copy, and revoke flows", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetch\("\/api\/share-links", \{ cache: "no-store" \}\)/);
  assert.match(page, /fetch\("\/api\/share-links", \{[\s\S]*?method: "POST"/);
  assert.match(page, /fetch\(`\/api\/share-links\/\$\{encodeURIComponent\(link\.id\)\}`, \{ method: "DELETE" \}\)/);
  assert.match(page, /navigator\.clipboard\?\.writeText/);
  assert.match(page, /onClick=\{\(\) => void copyCreatedShareUrl\(\)\}/);
  assert.match(page, /Link created, but the raw URL was not returned/);
  assert.match(page, /Revoke/);
  assert.match(page, /share-label/);
  assert.match(page, /share-expiry/);
  assert.match(css, /\.share-link-form\s*\{/);
  assert.match(css, /\.share-link-row\s*\{/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.share-link-form/);
});
