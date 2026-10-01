import assert from "node:assert/strict";
import test from "node:test";

import { startWorker } from "./helpers/worker-runtime.mjs";

// Local mode reaches the route code without a database, so a valid request ends at database_unavailable.
async function localWorker() {
  return startWorker({ CALOCOUNT_ALLOW_LOCAL: "true" });
}

test("owner API rejects invalid dates and timezones before database access", async () => {
  const worker = await localWorker();
  const request = (options) => worker.request(options);
  try {
    for (const timezone of ["Not/A_Timezone", "Invalid", "Asia/Ho_Chi_Minh_Typo"]) {
      const response = await request({ path: "/api/settings", method: "PATCH", body: { timezone } });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "invalid_field");
      const summary = await request({ path: `/api/dashboard/summary?timezone=${encodeURIComponent(timezone)}` });
      assert.equal(summary.status, 400);
      assert.equal(summary.body.error.code, "invalid_query");
    }
    for (const timezone of ["UTC", "Asia/Ho_Chi_Minh", "America/New_York"]) {
      const response = await request({ path: "/api/settings", method: "PATCH", body: { timezone } });
      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, "database_unavailable");
      const summary = await request({ path: `/api/dashboard/summary?timezone=${encodeURIComponent(timezone)}` });
      assert.equal(summary.status, 503);
      assert.equal(summary.body.error.code, "database_unavailable");
    }
    for (const proteinGoalMode of ["invalid", 1]) {
      const response = await request({ path: "/api/settings", method: "PATCH", body: { proteinGoalMode } });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "invalid_field");
    }
    for (const dailyProteinTargetPerKg of [0.7, 3.1, "1.6"]) {
      const response = await request({ path: "/api/settings", method: "PATCH", body: { dailyProteinTargetPerKg } });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "invalid_field");
    }
    for (const [path, method] of [
      ["/api/meals", "POST"],
      ["/api/meals/example", "PATCH"],
      ["/api/meals/example/copy", "POST"],
      ["/api/saved-entries/example/track", "POST"],
    ]) {
      for (const consumedAt of [1e100, -1e100]) {
        const response = await request({ path, method, body: { consumedAt } });
        assert.equal(response.status, 400, `${method} ${path} must reject ${consumedAt}`);
        assert.equal(response.body.error.code, "invalid_field");
      }
      const response = await request({ path, method, body: { consumedAt: 1_800_000_000_000 } });
      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, "database_unavailable");
    }
  } finally {
    await worker.dispose();
  }
});

test("settings reject malformed nutrient goals and accept valid ones", async () => {
  const worker = await localWorker();
  try {
    for (const nutrientTargets of [
      "fiberG",
      ["fiberG"],
      { notANutrient: 10 },
      { fiberG: 0 },
      { fiberG: -5 },
      { fiberG: "30" },
    ]) {
      const response = await worker.request({ path: "/api/settings", method: "PATCH", body: { nutrientTargets } });
      assert.equal(response.status, 400, JSON.stringify(nutrientTargets));
      assert.equal(response.body.error.code, "invalid_field");
    }
    for (const nutrientTargets of [null, {}, { fiberG: 35, sodiumMg: null }]) {
      const response = await worker.request({ path: "/api/settings", method: "PATCH", body: { nutrientTargets } });
      assert.equal(response.status, 503, JSON.stringify(nutrientTargets));
      assert.equal(response.body.error.code, "database_unavailable");
    }
  } finally {
    await worker.dispose();
  }
});

test("weights reject invalid dates and amounts and ignore a supplied recorded time", async () => {
  const worker = await localWorker();
  try {
    for (const body of [
      { logicalDate: "2026-02-30", weightKg: 70 },
      { logicalDate: "12/09/2026", weightKg: 70 },
      { logicalDate: "2026-09-12" },
      { logicalDate: "2026-09-12", weightKg: 0 },
      { logicalDate: "2026-09-12", weightKg: 1_001 },
      { logicalDate: "2026-09-12", weightKg: "70" },
    ]) {
      const response = await worker.request({ path: "/api/weights", method: "PUT", body });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.error.code, "invalid_field");
    }
    const valid = await worker.request({
      path: "/api/weights",
      method: "PUT",
      body: { logicalDate: "2026-09-12", weightKg: 70.5, recordedAt: "not a time" },
    });
    assert.equal(valid.status, 503);
    assert.equal(valid.body.error.code, "database_unavailable");
  } finally {
    await worker.dispose();
  }
});
