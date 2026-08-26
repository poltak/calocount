import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Calocount dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Calocount — simple calorie tracking<\/title>/i);
  assert.match(html, /Calocount/);
  assert.match(html, /Public read-only/);
  assert.match(html, /Loading public dashboard/);
  assert.doesNotMatch(html, /Greek yogurt bowl|Demo mode/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("removes the starter preview surface", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});

test("meal form accepts precise calories and captures every displayed macro", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /name="calories"[^>]*step="any"/);
  assert.match(page, /name="protein"[^>]*step="any"/);
  assert.match(page, /name="carbs"[^>]*step="any"/);
  assert.match(page, /name="fat"[^>]*step="any"/);
  assert.doesNotMatch(page.match(/<input name="protein"[^>]*>/)?.[0] ?? "", /\brequired\b/);
  assert.doesNotMatch(page.match(/<input name="carbs"[^>]*>/)?.[0] ?? "", /\brequired\b/);
  assert.doesNotMatch(page.match(/<input name="fat"[^>]*>/)?.[0] ?? "", /\brequired\b/);
  assert.match(page, /const carbs = Number\(form\.get\("carbs"\)/);
  assert.match(page, /const fat = Number\(form\.get\("fat"\)/);
  assert.match(page, /carbsG: meal\.carbs \?\? 0/);
  assert.match(page, /fatG: meal\.fat \?\? 0/);
});

test("daily weight supports add and edit with kilograms and an automatic saved time", async () => {
  const [page, route, repository] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/weights/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /selectedWeight \? "Edit weight" : "Add weight"/);
  assert.match(page, /name="weightKg"[\s\S]*?type="number"[\s\S]*?step="0\.1"/);
  assert.match(page, /Saved at \{formatRecordedTime\(selectedWeight\.recordedAt\)\}/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /body: JSON\.stringify\(\{ logicalDate, weightKg \}\)/);
  assert.match(page, /setWeightForDate\(logicalDate, optimisticWeight\)/);
  assert.match(page, /setWeightForDate\(logicalDate, previousWeight\)/);
  assert.doesNotMatch(route, /body\.recordedAt/);
  assert.match(repository, /recordedAt: timestamp/);
});

test("weight trend plots recorded days and keeps gaps visible", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<h2 id="weight-trend-title">Weight trend<\/h2>/);
  assert.match(page, /value: day\.weight\?\.weightKg \?\? null/);
  assert.match(page, /Recorded weight for the past seven days in kilograms; missing days are shown as gaps/);
  assert.match(page, /No weight records for the past seven days/);
  assert.match(page, /weightChartScale\.valueHeightPercents\[index\]/);
  assert.match(css, /\.weight-bar\s*{/);
  assert.match(css, /\.chart-empty\s*{/);
});

test("dashboard section tabs use hash-backed active state", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /window\.addEventListener\("hashchange"/);
  assert.match(page, /activeSection === "today" \? "active" : ""/);
  assert.match(page, /activeSection === "meals" \? "active" : ""/);
  assert.match(page, /activeSection === "trend" \? "active" : ""/);
  assert.match(page, /activeSection === "macros" \? "active" : ""/);
  assert.doesNotMatch(page, /<a className="active" href="#today">/);
});

test("jump navigation is responsive and meal rows show every macro", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(css, /\.jump-nav\s*{\s*display:\s*none;/);
  assert.match(css, /@media \(max-width: 880px\)[\s\S]*?\.jump-nav\s*{\s*display:\s*flex;/);
  assert.match(page, /meal-list-head[\s\S]*?<span>Meal<\/span><span>Energy<\/span><span>Protein<\/span><span>Carbs<\/span><span>Fat<\/span>/);
  assert.match(page, /className="meal-stat carbs-stat"/);
  assert.match(page, /className="meal-stat fat-stat"/);
  assert.match(page, /data-label="Energy"/);
  assert.match(page, /data-label="Protein"/);
  assert.match(page, /data-label="Carbs"/);
  assert.match(page, /data-label="Fat"/);
});

test("meal editor uses one PATCH save action", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /async function saveMeal\(mealId: string\)/);
  assert.match(page, /setActionState\("Saving changes…"\)/);
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /body: JSON\.stringify\(mealPayload\(meal\)\)/);
  assert.match(page, /onClick=\{\(\) => void saveMeal\(meal\.id\)\}/);
  assert.match(page, />Save changes<\/button>/);
  assert.doesNotMatch(page, /Save correction/);
  assert.doesNotMatch(page, /saveMeal\(meal\.id,\s*"(?:edit|correction)"\)/);
  assert.doesNotMatch(page, /operation === "correction"/);
});

test("meal rows expose a confirmed delete action and API removes dependent data", async () => {
  const [page, route, repository] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meals/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="meal-actions"/);
  assert.match(page, /async function deleteMeal\(mealId: string\)/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /aria-label=\{`Delete \$\{meal\.name\}`\}/);
  assert.match(page, /mealDeleteInFlight/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /await getPhotosBucket\(\)\.delete\(meal\.meal\.photoKey\)/);
  assert.match(route, /photoDeleted/);
  assert.match(repository, /export async function deleteMeal/);
  assert.match(repository, /db\.delete\(mealItems\)/);
  assert.match(repository, /db\.delete\(analysisJobs\)/);
  assert.match(repository, /db\.delete\(mealRevisions\)/);
  assert.match(repository, /db\.delete\(aiRuns\)/);
  assert.match(repository, /db\.delete\(telegramUpdates\)/);
  assert.match(repository, /db\.delete\(mealLogs\)/);
});
