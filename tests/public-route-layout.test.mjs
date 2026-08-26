import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the root route uses the public read-only dashboard source", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /return <Dashboard readOnly publicView \/>/);
  assert.match(page, /publicView\s*\?\s*"\/api\/public\/summary"/);
  assert.match(page, /publicView \? "Loading the public dashboard…"/);
  assert.match(page, /publicView \? "The public dashboard could not be loaded\. Try again later\."/);
  assert.doesNotMatch(page, /publicView[^\n]*dashboardFailureMessage/);
});

test("the owner route keeps the existing full dashboard", async () => {
  const route = await readFile(new URL("../app/owner/page.tsx", import.meta.url), "utf8");

  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /return <Dashboard \/>/);
  assert.doesNotMatch(route, /readOnly|publicView/);
});

test("the public summary route fails closed without an owner key", async () => {
  const [route, helper] = await Promise.all([
    readFile(new URL("../app/api/public/summary/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/public-summary.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getEnvValue\("CALOCOUNT_OWNER_KEY"\)/);
  assert.match(route, /buildPublicSummaryResponse/);
  assert.match(route, /getDashboardSummary\(getRequestDb\(\), ownerKey\)/);
  assert.match(route, /PublicSummaryConfigError/);
  assert.match(helper, /public_owner_key_missing/);
  assert.match(helper, /"cache-control": "no-store"/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
});

test("owner failures never enable the old editable demo fallback", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /setDataMode\("error"\)/);
  assert.doesNotMatch(page, /setDataMode\("demo"\)/);
  assert.match(page, /dataMode !== "live" \? <section className="share-state"/);
  assert.doesNotMatch(page, /local demo data is visible|changes stay local|Demo mode/);
  assert.match(page, /if \(readOnly \|\| dataMode !== "live"\) return;/);
});

test("owner share controls stay inactive until the live summary is available", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /if \(readOnly \|\| dataMode !== "live" \|\| shareListInFlight\.current\) return;/);
  assert.match(page, /\}, \[dataMode, readOnly\]\);/);
  assert.match(page, /if \(readOnly \|\| dataMode !== "live" \|\| shareCreateInFlight\.current\) return;/);
  assert.match(page, /if \(readOnly \|\| dataMode !== "live" \|\| link\.status !== "active"/);
  assert.match(page, /function toggleShareLinks\(\) \{\s*if \(readOnly \|\| dataMode !== "live"\) return;/);
  assert.match(page, /\{!readOnly && dataMode === "live" \? <>/);
  assert.match(page, /\{!readOnly && dataMode === "live" && showSettings \?/);
  assert.match(page, /\{!readOnly && dataMode === "live" && showShareLinks \?/);
});

test("the public root keeps every owner mutation and private photo control disabled", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /if \(readOnly\) return;/);
  assert.match(page, /className="share-nav-button"/);
  assert.match(page, /className="icon-button"/);
  assert.match(page, /className="primary-button"/);
  assert.match(page, /\{!readOnly && meal\.photoKey/);
  assert.match(page, /\{!readOnly && showWeightForm \? <form className="weight-form"/);
});
