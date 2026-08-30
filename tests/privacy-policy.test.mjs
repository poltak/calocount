import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderPrivacyPolicy() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/privacy", {
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

test("public privacy route renders the required policy statements", async () => {
  const response = await renderPrivacyPolicy();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  for (const statement of [
    "Privacy Policy",
    "personal, single-user meal logging service",
    "optional meal photo",
    "Cloudflare D1",
    "Cloudflare R2",
    "Temporary OpenAI file links are downloaded immediately",
    "We do not sell",
    "HTTPS and access controls",
    "request access to, correction of, or deletion",
    "August 30, 2026",
  ]) {
    assert.match(html, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("privacy route has no application authentication or private contact details", async () => {
  const page = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");

  assert.match(page, /export default function PrivacyPage/);
  assert.doesNotMatch(page, /requireApiIdentity|CALOCOUNT_CHATGPT_MEAL_TOKEN|@/);
  assert.doesNotMatch(page, /fetch\(|headers\(|cookies\(/);
});
