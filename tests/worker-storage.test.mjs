import assert from "node:assert/strict";
import test from "node:test";
import { startWorker } from "./helpers/worker-runtime.mjs";

// These requests run in the Workers runtime with a real database and bucket.
// The same handlers pass in Node while failing there, so they need their own tests.
const LOCAL = { CALOCOUNT_ALLOW_LOCAL: "true", CALOCOUNT_OWNER_KEY: "owner" };
const MCP_HEADERS = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" };

function mcp(worker, method, params, id = 1) {
  return worker.request({ path: "/mcp", method: "POST", headers: MCP_HEADERS, body: { jsonrpc: "2.0", id, method, params } });
}

test("the MCP endpoint lists its tools and logs, reads and updates a meal", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const initialized = await mcp(worker, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(initialized.status, 200);
    assert.equal(initialized.body.result.serverInfo.name, "calocount");

    const listed = await mcp(worker, "tools/list", {}, 2);
    assert.equal(listed.status, 200);
    assert.deepEqual(
      listed.body.result.tools.map((tool) => tool.name).sort(),
      ["add_meals", "get_nutrition_history", "get_nutrition_summary", "update_meal"],
    );

    const requestId = "4f4b2a53-7f0c-4b0e-9d5a-0c1f6f1f2a10";
    const added = await mcp(worker, "tools/call", {
      name: "add_meals",
      arguments: { meals: [{ request_id: requestId, name: "Chicken pho", kcal: 520, protein: 38, carbs: 62, fat: 12, eaten_at: "2026-10-02T12:30:00+07:00", nutrients: { fiberG: 3 } }] },
    }, 3);
    assert.equal(added.status, 200);
    assert.equal(added.body.result.isError, false);
    assert.equal(added.body.result.structuredContent.created_count, 1);
    assert.deepEqual(added.body.result.structuredContent.daily_totals, { date: "2026-10-02", kcal: 520, protein: 38, meal_count: 1 });

    // Sending the same request again reports the saved meal instead of adding a second one.
    const repeated = await mcp(worker, "tools/call", {
      name: "add_meals",
      arguments: { meals: [{ request_id: requestId, name: "Chicken pho", kcal: 520, protein: 38, carbs: 62, fat: 12, eaten_at: "2026-10-02T12:30:00+07:00", nutrients: { fiberG: 3 } }] },
    }, 4);
    assert.equal(repeated.body.result.structuredContent.already_exists_count, 1);

    const summary = await mcp(worker, "tools/call", { name: "get_nutrition_summary", arguments: { start_date: "2026-10-02", end_date: "2026-10-02" } }, 5);
    assert.equal(summary.body.result.isError, false);
    assert.equal(summary.body.result.structuredContent.days[0].totals.caloriesKcal, 520);

    const history = await mcp(worker, "tools/call", { name: "get_nutrition_history", arguments: { start_date: "2026-10-02", end_date: "2026-10-02" } }, 6);
    assert.equal(history.body.result.isError, false);
    assert.match(JSON.stringify(history.body.result.structuredContent), /Chicken pho/);

    const updated = await mcp(worker, "tools/call", { name: "update_meal", arguments: { request_id: requestId, patch: { name: "Beef pho" } } }, 7);
    assert.equal(updated.body.result.isError, false, JSON.stringify(updated.body.result.structuredContent));
    assert.match(JSON.stringify(updated.body.result.structuredContent), /Beef pho/);
  } finally {
    await worker.dispose();
  }
});

test("a dashboard entry with a photo is saved and its photo can be read back", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const form = new FormData();
    form.set("payload", JSON.stringify({
      consumedAt: Date.parse("2026-10-02T05:30:00Z"), mealType: "lunch", source: "dashboard", status: "complete", caption: "Photo lunch",
      items: [{ name: "Photo lunch", quantity: 1, unit: "serving", calories: 300, proteinG: 20, carbsG: 30, fatG: 10 }],
    }));
    form.set("photo", new File([png], "lunch.png", { type: "image/png" }));
    // Encode the form here so the request carries its multipart boundary.
    const encoded = new Response(form);
    const saved = await worker.fetch("/api/meals", {
      method: "POST",
      headers: { "content-type": encoded.headers.get("content-type") },
      body: Buffer.from(await encoded.arrayBuffer()),
    });
    assert.equal(saved.status, 201);
    const { meal } = await saved.json();
    assert.equal(meal.caption, "Photo lunch");
    assert.equal(meal.photoMimeType, "image/png");

    const photo = await worker.fetch(`/api/photos/${meal.photoKey}`);
    assert.equal(photo.status, 200);
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
  } finally {
    await worker.dispose();
  }
});
