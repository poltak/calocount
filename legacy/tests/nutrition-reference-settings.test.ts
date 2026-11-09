import assert from "node:assert/strict";
import test from "node:test";

import { getSettings, upsertSettings } from "../db/repository";
import { parseDashboardPayload, parseSettingsTargets } from "../app/dashboard-api";
import { createSqliteTestDb } from "./helpers/sqlite-db";

const OWNER_KEY = "reference-owner";

test("adult B6 UL confirmation persists with an audit timestamp and clears when disabled", async () => {
  const fixture = createSqliteTestDb();
  try {
    const enabled = await upsertSettings(fixture.db, OWNER_KEY, { vitaminB6UsFnbAdultUlEnabled: true });
    assert.equal(enabled.vitaminB6UsFnbAdultUlEnabled, true);
    assert.equal(typeof enabled.vitaminB6UsFnbAdultUlConfirmedAt, "number");

    const confirmedAt = enabled.vitaminB6UsFnbAdultUlConfirmedAt;
    const unchanged = await upsertSettings(fixture.db, OWNER_KEY, { timezone: "UTC" });
    assert.equal(unchanged.vitaminB6UsFnbAdultUlEnabled, true);
    assert.equal(unchanged.vitaminB6UsFnbAdultUlConfirmedAt, confirmedAt);

    const disabled = await upsertSettings(fixture.db, OWNER_KEY, { vitaminB6UsFnbAdultUlEnabled: false });
    assert.equal(disabled.vitaminB6UsFnbAdultUlEnabled, false);
    assert.equal(disabled.vitaminB6UsFnbAdultUlConfirmedAt, null);
    assert.equal((await getSettings(fixture.db, OWNER_KEY))?.vitaminB6UsFnbAdultUlEnabled, false);
  } finally {
    fixture.sqlite.close();
  }
});

test("general U.S. FNB adult UL confirmation is independent from the B6-only setting", async () => {
  const fixture = createSqliteTestDb();
  try {
    const enabled = await upsertSettings(fixture.db, OWNER_KEY, { usFnbAdultUlEnabled: true });
    assert.equal(enabled.usFnbAdultUlEnabled, true);
    assert.equal(enabled.vitaminB6UsFnbAdultUlEnabled, false);
    assert.equal(typeof enabled.usFnbAdultUlConfirmedAt, "number");
    const confirmedAt = enabled.usFnbAdultUlConfirmedAt;
    const unchanged = await upsertSettings(fixture.db, OWNER_KEY, { timezone: "UTC" });
    assert.equal(unchanged.usFnbAdultUlConfirmedAt, confirmedAt);
    const disabled = await upsertSettings(fixture.db, OWNER_KEY, { usFnbAdultUlEnabled: false });
    assert.equal(disabled.usFnbAdultUlEnabled, false);
    assert.equal(disabled.usFnbAdultUlConfirmedAt, null);
  } finally {
    fixture.sqlite.close();
  }
});

test("private dashboard/settings parsers keep the explicit B6 profile opt-in", () => {
  const dashboard = parseDashboardPayload({
    date: "2026-09-19",
    targets: { calories: 2_000, proteinG: 120, nutrients: {} },
    referenceSettings: { vitaminB6UsFnbAdultUlEnabled: true },
    proteinGoal: { mode: "grams", fixedTargetG: 120, targetG: 120, gramsPerKg: null, weightKg: null, weightDate: null, byDate: [] },
    today: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0 },
    sevenDay: { calories: 0, proteinG: 0, averageCalories: 0, averageProteinG: 0, daysWithMeals: 0 },
    recentMeals: [],
    recentWeights: [],
  });
  assert.equal(dashboard?.referenceSettings?.vitaminB6UsFnbAdultUlEnabled, true);
  assert.equal(dashboard?.referenceSettings?.usFnbAdultUlEnabled, false);

  const settings = parseSettingsTargets({
    settings: {
      dailyCalorieTarget: 2_000,
      dailyProteinTargetG: 120,
      proteinGoalMode: "grams",
      nutrientTargets: {},
      vitaminB6UsFnbAdultUlEnabled: true,
      usFnbAdultUlEnabled: true,
    },
  });
  assert.equal(settings?.vitaminB6UsFnbAdultUlEnabled, true);
  assert.equal(settings?.usFnbAdultUlEnabled, true);
});
