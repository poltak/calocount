import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the root route uses the public read-only dashboard source", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /return <Dashboard readOnly publicView \/>/);
  assert.match(page, /publicView\s*\?\s*"\/api\/public\/summary"/);
  assert.match(page, /readOnly \? "Loading the public dashboard…"/);
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

test("the public meal-photo route is read-only and uses the configured public projection", async () => {
  const [route, helper] = await Promise.all([
    readFile(new URL("../app/meal-photos/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/public-meal-photo.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getEnvValue\("CALOCOUNT_OWNER_KEY"\)/);
  assert.match(route, /getDashboardSummary\(getRequestDb\(\), ownerKey\)/);
  assert.match(route, /getPhotosBucket\(\)\.get\(photoKey\)/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /requireApiIdentity/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(helper, /meal\.status === "complete"/);
  assert.match(helper, /isPublicPhotoMimeType/);
  assert.match(helper, /isWithinPublicDateRange/);
  assert.match(helper, /"x-content-type-options": "nosniff"/);
});

test("owner failures never enable the old editable demo fallback", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /setDataMode\("error"\)/);
  assert.doesNotMatch(page, /setDataMode\("demo"\)/);
  assert.match(page, /dataMode !== "live" \? <section className="dashboard-state"/);
  assert.doesNotMatch(page, /local demo data is visible|changes stay local|Demo mode/);
  assert.match(page, /if \(readOnly \|\| dataMode !== "live"\) return;/);
});

test("the public root has no tokenized or owner link controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /publicView \? "\/api\/public\/summary"/);
  assert.doesNotMatch(page, /share/i);
  assert.match(page, /\{!readOnly && dataMode === "live" && showSettings \?/);
});

test("the public root keeps every owner mutation and private photo control disabled", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /if \(readOnly\) return;/);
  assert.match(page, /className="icon-button"/);
  assert.match(page, /className="primary-button"/);
  assert.match(page, /\{meal\.photoUrl && !failedPhotoUrls\.has\(meal\.photoUrl\)/);
  assert.match(page, /\{!readOnly && editingMealId === meal\.id/);
  assert.match(page, /\{!readOnly && showWeightForm \? <form className="weight-form"/);
});

test("every write API route requires the owner identity", async () => {
  const routePaths = [
    "../app/api/ai-profiles/route.ts",
    "../app/api/meals/route.ts",
    "../app/api/meals/[id]/route.ts",
    "../app/api/meals/[id]/corrections/route.ts",
    "../app/api/settings/route.ts",
    "../app/api/weights/route.ts",
  ];
  const routes = await Promise.all(routePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));

  for (const route of routes) {
    assert.match(route, /requireApiIdentity\(request\)/);
    assert.match(route, /export async function (POST|PUT|PATCH|DELETE)/);
  }
});
