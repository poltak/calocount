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
  assert.match(html, /Calories/);
  assert.match(html, /Protein/);
  assert.match(html, /Today/);
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
