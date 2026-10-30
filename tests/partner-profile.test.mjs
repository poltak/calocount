import assert from "node:assert/strict";
import test from "node:test";
import { startWorker } from "./helpers/worker-runtime.mjs";

// The partner profile is a second log under the same sign-in. These requests
// run the built Worker with a real database.
const LOCAL = { CALOCOUNT_ALLOW_LOCAL: "true", CALOCOUNT_OWNER_KEY: "owner" };
const MCP_HEADERS = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" };

function mcp(worker, name, arguments_, id = 1) {
  return worker.request({ path: "/mcp", method: "POST", headers: MCP_HEADERS, body: { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: arguments_ } } });
}

function addMeal(worker, { name, profile }) {
  return worker.request({
    path: profile ? `/api/meals?profile=${profile}` : "/api/meals",
    method: "POST",
    body: {
      consumedAt: Date.now(), mealType: "lunch", source: "dashboard", status: "complete", caption: name,
      items: [{ name, quantity: 1, unit: "serving", calories: 400, proteinG: 20, carbsG: 40, fatG: 10 }],
    },
  });
}

test("the partner profile answers only while the owner has it on", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const off = await worker.request({ path: "/api/dashboard/summary?profile=partner" });
    assert.equal(off.status, 404);
    assert.equal(off.body.error.code, "profile_off");
    assert.equal((await addMeal(worker, { name: "Lost lunch", profile: "partner" })).status, 404);

    const unknown = await worker.request({ path: "/api/dashboard/summary?profile=Wife" });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "invalid_profile");

    const owner = await worker.request({ path: "/api/dashboard/summary" });
    assert.equal(owner.body.profile, "owner");
    assert.equal(owner.body.partnerProfileEnabled, false);

    const turnedOn = await worker.request({ path: "/api/settings", method: "PATCH", body: { partnerProfileEnabled: true } });
    assert.equal(turnedOn.status, 200);
    assert.equal(turnedOn.body.partnerProfileEnabled, true);
    assert.equal(turnedOn.body.profile, "owner");
    const partner = await worker.request({ path: "/api/dashboard/summary?profile=partner" });
    assert.equal(partner.status, 200);
    assert.equal(partner.body.profile, "partner");
    assert.equal(partner.body.partnerProfileEnabled, true);

    const turnedOff = await worker.request({ path: "/api/settings", method: "PATCH", body: { partnerProfileEnabled: false } });
    assert.equal(turnedOff.body.partnerProfileEnabled, false);
    assert.equal((await worker.request({ path: "/api/settings?profile=partner" })).status, 404);
  } finally {
    await worker.dispose();
  }
});

test("each profile keeps its own entries, weights and settings", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    await worker.request({ path: "/api/settings", method: "PATCH", body: { partnerProfileEnabled: true, dailyCalorieTarget: 2400 } });
    assert.equal((await addMeal(worker, { name: "Owner lunch" })).status, 201);
    assert.equal((await addMeal(worker, { name: "Partner lunch", profile: "partner" })).status, 201);
    const today = new Date().toISOString().slice(0, 10);
    await worker.request({ path: "/api/weights?profile=partner", method: "PUT", body: { logicalDate: today, weightKg: 58.2 } });

    const owner = await worker.request({ path: "/api/dashboard/summary" });
    const partner = await worker.request({ path: "/api/dashboard/summary?profile=partner" });
    assert.deepEqual(owner.body.recentMeals.map((meal) => meal.caption), ["Owner lunch"]);
    assert.deepEqual(partner.body.recentMeals.map((meal) => meal.caption), ["Partner lunch"]);
    assert.deepEqual(owner.body.recentWeights, []);
    assert.equal(partner.body.recentWeights[0].weightKg, 58.2);

    // The partner starts with no saved settings. Owner-only settings refuse a change there.
    const partnerSettings = await worker.request({ path: "/api/settings?profile=partner" });
    assert.equal(partnerSettings.body.settings, null);
    assert.equal(partnerSettings.body.profile, "partner");
    assert.equal(partnerSettings.body.partnerProfileEnabled, true);
    const goals = await worker.request({ path: "/api/settings?profile=partner", method: "PATCH", body: { dailyCalorieTarget: 1800 } });
    assert.equal(goals.status, 200);
    assert.equal(goals.body.settings.dailyCalorieTarget, 1800);
    assert.equal((await worker.request({ path: "/api/settings" })).body.settings.dailyCalorieTarget, 2400);
    for (const field of ["publicViewEnabled", "partnerProfileEnabled"]) {
      const refused = await worker.request({ path: "/api/settings?profile=partner", method: "PATCH", body: { [field]: true } });
      assert.equal(refused.status, 400, field);
      assert.equal(refused.body.error.code, "owner_only_setting", field);
    }

    // An entry of one profile cannot be read through the other.
    const partnerMealId = partner.body.recentMeals[0].id;
    assert.equal((await worker.request({ path: `/api/meals/${partnerMealId}` })).status, 404);
    assert.equal((await worker.request({ path: `/api/meals/${partnerMealId}?profile=partner` })).status, 200);
  } finally {
    await worker.dispose();
  }
});

test("the MCP tools log and read the partner's log when asked", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const meal = (requestId, name) => ({ request_id: requestId, name, kcal: 300, protein: 12, carbs: 40, fat: 8, eaten_at: new Date().toISOString() });
    const today = new Date().toISOString().slice(0, 10);

    const listed = await worker.request({ path: "/mcp", method: "POST", headers: MCP_HEADERS, body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
    for (const tool of listed.body.result.tools) {
      assert.deepEqual(tool.inputSchema.properties.profile.enum, ["owner", "partner"], tool.name);
      assert.ok(!tool.inputSchema.required?.includes("profile"), tool.name);
    }

    const refused = await mcp(worker, "add_meals", { profile: "partner", meals: [meal("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", "Toast")] });
    assert.equal(refused.body.result.isError, true);
    assert.equal(refused.body.result.structuredContent.error.code, "profile_off");
    const unknown = await mcp(worker, "get_nutrition_summary", { profile: "wife", start_date: today, end_date: today });
    assert.equal(unknown.body.result.structuredContent.error.code, "invalid_profile");

    await worker.request({ path: "/api/settings", method: "PATCH", body: { partnerProfileEnabled: true } });
    const added = await mcp(worker, "add_meals", { profile: "partner", meals: [meal("6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b", "Porridge")] });
    assert.equal(added.body.result.isError, false);
    assert.equal(added.body.result.structuredContent.profile, "partner");
    assert.match(added.body.result.content[0].text, /^Partner profile\. /);

    const partnerHistory = await mcp(worker, "get_nutrition_history", { profile: "partner", start_date: today, end_date: today });
    assert.equal(partnerHistory.body.result.structuredContent.meals.length, 1);
    const ownerHistory = await mcp(worker, "get_nutrition_history", { start_date: today, end_date: today });
    assert.equal(ownerHistory.body.result.structuredContent.profile, "owner");
    assert.equal(ownerHistory.body.result.structuredContent.meals.length, 0);

    // An edit without the partner profile does not find the partner's meal.
    const requestId = partnerHistory.body.result.structuredContent.meals[0].request_id;
    const wrongProfile = await mcp(worker, "update_meal", { request_id: requestId, patch: { name: "Oat porridge" } });
    assert.equal(wrongProfile.body.result.structuredContent.error.code, "not_found");
    const edited = await mcp(worker, "update_meal", { profile: "partner", request_id: requestId, patch: { name: "Oat porridge" } });
    assert.equal(edited.body.result.isError, false);
    assert.equal(edited.body.result.structuredContent.profile, "partner");
  } finally {
    await worker.dispose();
  }
});

test("the partner page needs the same sign-in as the owner page", async () => {
  const worker = await startWorker({ CALOCOUNT_ALLOW_LOCAL: "false", CALOCOUNT_OWNER_KEY: "owner", CALOCOUNT_SETUP_CODE: "correct horse battery staple" }, { storage: true });
  try {
    const page = await worker.fetch("/owner/partner", { redirect: "manual" });
    assert.equal(page.status, 200);
    const body = await page.text();
    assert.match(body, /data-view="sign-in"/);
    assert.match(body, /\/owner\/partner/);
    assert.equal((await worker.request({ path: "/api/dashboard/summary?profile=partner" })).status, 401);
  } finally {
    await worker.dispose();
  }
});
