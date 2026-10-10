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

test("the MCP endpoint lists its tools, logs, reads and updates a meal, and reads weights", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const initialized = await mcp(worker, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(initialized.status, 200);
    assert.equal(initialized.body.result.serverInfo.name, "calocount");

    const listed = await mcp(worker, "tools/list", {}, 2);
    assert.equal(listed.status, 200);
    assert.deepEqual(
      listed.body.result.tools.map((tool) => tool.name).sort(),
      ["add_meals", "get_nutrition_history", "get_nutrition_summary", "get_weight_history", "update_meal"],
    );

    // The daily totals are those of the current day, so the meal is eaten now. A new owner's days are counted in UTC.
    const eatenAt = new Date().toISOString();
    const today = eatenAt.slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const requestId = "4f4b2a53-7f0c-4b0e-9d5a-0c1f6f1f2a10";
    const added = await mcp(worker, "tools/call", {
      name: "add_meals",
      arguments: { meals: [{ request_id: requestId, name: "Chicken pho", kcal: 520, protein: 38, carbs: 62, fat: 12, eaten_at: eatenAt, nutrients: { fiberG: 3 } }] },
    }, 3);
    assert.equal(added.status, 200);
    assert.equal(added.body.result.isError, false);
    assert.equal(added.body.result.structuredContent.created_count, 1);
    assert.deepEqual(added.body.result.structuredContent.daily_totals, { date: today, kcal: 520, protein: 38, meal_count: 1 });

    // Sending the same request again reports the saved meal instead of adding a second one.
    const repeated = await mcp(worker, "tools/call", {
      name: "add_meals",
      arguments: { meals: [{ request_id: requestId, name: "Chicken pho", kcal: 520, protein: 38, carbs: 62, fat: 12, eaten_at: eatenAt, nutrients: { fiberG: 3 } }] },
    }, 4);
    assert.equal(repeated.body.result.structuredContent.already_exists_count, 1);

    const summary = await mcp(worker, "tools/call", { name: "get_nutrition_summary", arguments: { start_date: today, end_date: today } }, 5);
    assert.equal(summary.body.result.isError, false);
    assert.equal(summary.body.result.structuredContent.days[0].totals.caloriesKcal, 520);
    assert.deepEqual(summary.body.result.structuredContent.goalChanges, []);

    const history = await mcp(worker, "tools/call", { name: "get_nutrition_history", arguments: { start_date: today, end_date: today } }, 6);
    assert.equal(history.body.result.isError, false);
    assert.match(JSON.stringify(history.body.result.structuredContent), /Chicken pho/);

    const weighed = await worker.request({ path: "/api/weights", method: "PUT", body: { logicalDate: today, weightKg: 66.3 } });
    assert.equal(weighed.status, 200);
    const weights = await mcp(worker, "tools/call", { name: "get_weight_history", arguments: { start_date: monthAgo, end_date: today } }, 8);
    assert.equal(weights.body.result.isError, false);
    assert.equal(weights.body.result.structuredContent.firstWeightDate, today);
    assert.deepEqual(weights.body.result.structuredContent.weights.map(({ date, weightKg }) => [date, weightKg]), [[today, 66.3]]);

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

test("the owner can read the totals of a past month and the entries of a past day", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const addMeal = (eatenAt, name, calories, proteinG) => worker.request({
      path: "/api/meals",
      method: "POST",
      body: {
        consumedAt: Date.parse(eatenAt), mealType: "dinner", source: "dashboard", status: "complete", caption: name,
        items: [{ name, quantity: 1, unit: "serving", calories, proteinG, carbsG: 60, fatG: 12, fiberG: 4 }],
      },
    });
    // 18:30 UTC on 19 March is 01:30 on 20 March in Ho Chi Minh City.
    for (const meal of [["2025-03-19T18:30:00Z", "Late pho", 520.5, 38], ["2025-03-20T05:00:00Z", "Rice bowl", 610, 31.5], ["2025-04-02T05:00:00Z", "April lunch", 450, 25]]) {
      assert.equal((await addMeal(...meal)).status, 201);
    }
    const weighed = await worker.request({ path: "/api/weights", method: "PUT", body: { logicalDate: "2025-03-20", weightKg: 68.4 } });
    assert.equal(weighed.status, 200);

    const timezone = encodeURIComponent("Asia/Ho_Chi_Minh");
    const month = await worker.request({ path: `/api/days?month=2025-03&timezone=${timezone}` });
    assert.equal(month.status, 200);
    assert.deepEqual(month.body, {
      month: "2025-03",
      timezone: "Asia/Ho_Chi_Minh",
      firstDate: "2025-03-20",
      days: [{ date: "2025-03-20", calories: 1130.5, proteinG: 69.5, mealCount: 2 }],
    });
    // In UTC the late meal falls on the day before.
    const utcMonth = await worker.request({ path: "/api/days?month=2025-03" });
    assert.deepEqual(utcMonth.body.days.map((day) => [day.date, day.mealCount]), [["2025-03-19", 1], ["2025-03-20", 1]]);

    const day = await worker.request({ path: `/api/days/2025-03-20?timezone=${timezone}` });
    assert.equal(day.status, 200);
    assert.equal(day.body.date, "2025-03-20");
    assert.deepEqual(day.body.meals.map((meal) => [meal.caption, meal.totalCalories, meal.items[0].name]), [["Rice bowl", 610, "Rice bowl"], ["Late pho", 520.5, "Late pho"]]);
    assert.equal(day.body.weight.weightKg, 68.4);
    assert.equal(day.body.proteinGoal.date, "2025-03-20");
    assert.doesNotMatch(JSON.stringify(day.body), /ownerKey/);

    const emptyDay = await worker.request({ path: "/api/days/2025-03-21" });
    assert.equal(emptyDay.status, 200);
    assert.deepEqual(emptyDay.body.meals, []);
    assert.equal(emptyDay.body.weight, null);

    // The public calendar reads the same data on the summary path, in the saved timezone and without private fields.
    const timezoneSaved = await worker.request({ path: "/api/settings", method: "PATCH", body: { timezone: "Asia/Ho_Chi_Minh" } });
    assert.equal(timezoneSaved.status, 200);
    const publicMonth = await worker.request({ path: "/api/public/summary?view=month&month=2025-03" });
    assert.equal(publicMonth.status, 200);
    assert.match(publicMonth.headers.get("cache-control") ?? "", /no-store/);
    assert.deepEqual(publicMonth.body, { view: "month", ...month.body });
    const publicDay = await worker.request({ path: "/api/public/summary?view=day&date=2025-03-20" });
    assert.equal(publicDay.status, 200);
    assert.equal(publicDay.body.timezone, "Asia/Ho_Chi_Minh");
    assert.deepEqual(publicDay.body.meals.map((meal) => [meal.items[0].name, meal.totalCalories, meal.hasPhoto]), [["Rice bowl", 610, false], ["Late pho", 520.5, false]]);
    assert.equal(publicDay.body.weight.weightKg, 68.4);
    assert.doesNotMatch(publicDay.text, /ownerKey|caption|photoKey|notes/);
    for (const path of ["/api/public/summary?view=month", "/api/public/summary?view=month&month=2025-13", "/api/public/summary?view=day", "/api/public/summary?view=day&date=2025-02-30"]) {
      const invalid = await worker.request({ path });
      assert.equal(invalid.status, 400, path);
      assert.equal(invalid.body.error.code, "invalid_query");
    }
  } finally {
    await worker.dispose();
  }
});

test("the public daily view covers the whole history in a small response", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const day = 86_400_000;
    const today = new Date().toISOString().slice(0, 10);
    const dateBefore = (days) => new Date(Date.now() - days * day).toISOString().slice(0, 10);
    // Forty days of meals and weights: more than the 30 days the dashboard view carries.
    for (let daysBefore = 0; daysBefore < 40; daysBefore += 1) {
      const saved = await worker.request({
        path: "/api/meals",
        method: "POST",
        body: {
          consumedAt: Date.parse(`${dateBefore(daysBefore)}T00:00:01Z`), mealType: "lunch", source: "dashboard", status: "complete", caption: "Private caption",
          items: [{ name: "Rice bowl", quantity: 1, unit: "serving", calories: 500.1, proteinG: 30.2, carbsG: 60, fatG: 12, fiberG: 4 }],
        },
      });
      assert.equal(saved.status, 201);
      const weighed = await worker.request({ path: "/api/weights", method: "PUT", body: { logicalDate: dateBefore(daysBefore), weightKg: 70 - daysBefore / 10 } });
      assert.equal(weighed.status, 200);
    }

    const goalsSaved = await worker.request({ path: "/api/settings", method: "PATCH", body: { dailyCalorieTarget: 2100, dailyProteinTargetG: 140 } });
    assert.equal(goalsSaved.status, 200);
    const timezoneSaved = await worker.request({ path: "/api/settings", method: "PATCH", body: { timezone: "UTC" } });
    assert.equal(timezoneSaved.status, 200);

    const daily = await worker.request({ path: "/api/public/summary?view=daily" });
    assert.equal(daily.status, 200);
    assert.deepEqual(daily.body.targets, { calories: 2100, proteinG: 140 });
    // One change for the goals. Saving the timezone afterwards does not add another.
    assert.equal(daily.body.goalChanges.length, 1);
    const { changedAt, ...goals } = daily.body.goalChanges[0];
    assert.deepEqual(goals, { date: today, calories: 2100, proteinMode: "grams", proteinG: 140, proteinGramsPerKg: null });
    assert.ok(Math.abs(Date.now() - changedAt) < 60_000);
    assert.match(daily.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(daily.body.view, "daily");
    assert.equal(daily.body.timezone, "UTC");
    assert.equal(daily.body.date, today);
    assert.equal(daily.body.firstEntryDate, dateBefore(39));
    assert.equal(daily.body.firstWeightDate, dateBefore(39));
    assert.equal(daily.body.fromDate, dateBefore(39));
    assert.equal(daily.body.days.length, 40);
    assert.deepEqual(daily.body.days[0], { date: dateBefore(39), calories: 500.1, proteinG: 30.2, carbsG: 60, fatG: 12, mealCount: 1, weightKg: 66.1 });
    assert.deepEqual(daily.body.days.at(-1), { date: today, calories: 500.1, proteinG: 30.2, carbsG: 60, fatG: 12, mealCount: 1, weightKg: 70 });
    assert.doesNotMatch(daily.text, /Rice bowl|Private caption|owner/);

    // The dashboard view stays the default and is many times larger for the same data.
    const dashboard = await worker.request({ path: "/api/public/summary" });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.trend.weights.length, 30);
    assert.ok(daily.text.length * 10 < dashboard.text.length, `daily ${daily.text.length} bytes, dashboard ${dashboard.text.length} bytes`);
    assert.ok(daily.text.length < 6_000, `daily view is ${daily.text.length} bytes`);

    const unknown = await worker.request({ path: "/api/public/summary?view=everything" });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "invalid_query");
  } finally {
    await worker.dispose();
  }
});
