import assert from "node:assert/strict";
import test from "node:test";

import { getDailyHistory } from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

type Fixture = ReturnType<typeof createSqliteTestDb>;

function insertMeal(fixture: Fixture, id: string, eatenAt: string, calories: number, { ownerKey = "owner", status = "complete" } = {}) {
  fixture.sqlite.prepare(`
    INSERT INTO meal_logs (id, owner_key, consumed_at, status, total_calories, total_protein_g, total_carbs_g, total_fat_g)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerKey, Date.parse(eatenAt), status, calories, calories / 20, calories / 10, calories / 40);
}

function insertWeight(fixture: Fixture, logicalDate: string, weightKg: number, ownerKey = "owner") {
  fixture.sqlite.prepare("INSERT INTO daily_weights (id, owner_key, logical_date, weight_kg, recorded_at) VALUES (?, ?, ?, ?, ?)")
    .run(`weight-${ownerKey}-${logicalDate}`, ownerKey, logicalDate, weightKg, Date.parse(`${logicalDate}T01:00:00Z`));
}

function saveSettings(fixture: Fixture, columns: Record<string, string | number>) {
  const names = Object.keys(columns);
  fixture.sqlite.prepare(`INSERT INTO settings (id, owner_key, ${names.join(", ")}) VALUES ('settings', 'owner', ${names.map(() => "?").join(", ")})`)
    .run(...Object.values(columns));
}

test("daily history has one row for each day since the first entry, in the saved timezone", async () => {
  const fixture = createSqliteTestDb();
  try {
    saveSettings(fixture, { timezone: "Asia/Ho_Chi_Minh", daily_calorie_target: 2_100, daily_protein_target_g: 140 });
    // 06:30 on 10 September in Ho Chi Minh City is 23:30 on 9 September in UTC.
    insertMeal(fixture, "breakfast", "2026-09-09T23:30:00Z", 400);
    insertMeal(fixture, "lunch", "2026-09-10T05:00:00Z", 700.1);
    insertMeal(fixture, "snack", "2026-09-10T08:00:00Z", 100.2);
    insertMeal(fixture, "late-dinner", "2026-09-12T16:30:00Z", 650);
    insertMeal(fixture, "pending", "2026-09-10T06:00:00Z", 999, { status: "pending" });
    insertMeal(fixture, "foreign", "2026-09-01T06:00:00Z", 999, { ownerKey: "other-owner" });
    insertMeal(fixture, "tomorrow", "2026-09-12T18:00:00Z", 999);
    insertWeight(fixture, "2026-09-08", 70.4);
    insertWeight(fixture, "2026-09-11", 70.1);
    insertWeight(fixture, "2026-08-01", 80, "other-owner");

    // 20:00 on 12 September in Ho Chi Minh City.
    const history = await getDailyHistory(fixture.db, "owner", { now: new Date("2026-09-12T13:00:00Z") });

    assert.equal(history.timezone, "Asia/Ho_Chi_Minh");
    assert.equal(history.date, "2026-09-12");
    assert.equal(history.firstEntryDate, "2026-09-10");
    assert.equal(history.firstWeightDate, "2026-09-08");
    assert.equal(history.fromDate, "2026-09-08");
    assert.equal(history.toDate, "2026-09-12");
    assert.deepEqual(history.targets, { calories: 2_100, proteinG: 140 });
    assert.deepEqual(history.days.map((day) => [day.date, day.mealCount, day.weightKg]), [
      ["2026-09-08", 0, 70.4],
      ["2026-09-09", 0, null],
      ["2026-09-10", 3, null],
      ["2026-09-11", 0, 70.1],
      // 23:30 on 12 September there. The 01:00 meal on 13 September is not in the range yet.
      ["2026-09-12", 1, null],
    ]);
    const firstDay = history.days[2];
    assert.ok(Math.abs(firstDay.calories - 1_200.3) < 1e-6);
    assert.ok(Math.abs(firstDay.proteinG - 60.015) < 1e-6);
    assert.ok(Math.abs(firstDay.carbsG - 120.03) < 1e-6);
    assert.ok(Math.abs(firstDay.fatG - 30.0075) < 1e-6);
    assert.ok(fixture.queries.every(({ values }) => values.length <= 100));
  } finally {
    fixture.sqlite.close();
  }
});

test("daily history puts meals on the right day when the clocks change", async () => {
  const fixture = createSqliteTestDb();
  try {
    saveSettings(fixture, { timezone: "America/New_York" });
    // New York is 5 hours behind UTC until 02:00 on 8 March 2026, then 4 hours behind.
    insertMeal(fixture, "before-change", "2026-03-08T04:30:00Z", 100); // 23:30 on 7 March
    insertMeal(fixture, "night-of-change", "2026-03-08T05:30:00Z", 200); // 00:30 on 8 March
    insertMeal(fixture, "after-change", "2026-03-09T03:30:00Z", 300); // 23:30 on 8 March
    insertMeal(fixture, "next-day", "2026-03-09T04:30:00Z", 400); // 00:30 on 9 March
    // The clocks go back at 02:00 on 1 November 2026.
    insertMeal(fixture, "autumn-late", "2026-11-02T04:30:00Z", 500); // 23:30 on 1 November
    insertMeal(fixture, "autumn-next", "2026-11-02T05:30:00Z", 600); // 00:30 on 2 November

    const history = await getDailyHistory(fixture.db, "owner", { now: new Date("2026-11-03T12:00:00Z") });
    const calories = new Map(history.days.map((day) => [day.date, day.calories]));

    assert.equal(history.firstEntryDate, "2026-03-07");
    assert.equal(calories.get("2026-03-07"), 100);
    assert.equal(calories.get("2026-03-08"), 500);
    assert.equal(calories.get("2026-03-09"), 400);
    assert.equal(calories.get("2026-11-01"), 500);
    assert.equal(calories.get("2026-11-02"), 600);
    assert.equal(history.days.reduce((total, day) => total + day.calories, 0), 2_100);
  } finally {
    fixture.sqlite.close();
  }
});

test("daily history keeps the latest 366 days and still reports when tracking began", async () => {
  const fixture = createSqliteTestDb();
  try {
    saveSettings(fixture, { protein_goal_mode: "gramsPerKg", daily_protein_target_per_kg: 2 });
    insertMeal(fixture, "long-ago", "2024-01-15T12:00:00Z", 500);
    insertMeal(fixture, "recent", "2026-09-10T12:00:00Z", 800);
    insertWeight(fixture, "2024-02-01", 75);

    const history = await getDailyHistory(fixture.db, "owner", { now: new Date("2026-09-12T12:00:00Z") });

    assert.equal(history.timezone, "UTC");
    assert.equal(history.firstEntryDate, "2024-01-15");
    assert.equal(history.firstWeightDate, "2024-02-01");
    assert.equal(history.fromDate, "2025-09-12");
    assert.equal(history.days.length, 366);
    assert.equal(history.days[0].date, "2025-09-12");
    assert.equal(history.days.at(-1)?.date, "2026-09-12");
    assert.equal(history.days.reduce((total, day) => total + day.calories, 0), 800);
    // The protein target uses the latest weight, although it is older than the days returned.
    assert.deepEqual(history.targets, { calories: null, proteinG: 150 });
  } finally {
    fixture.sqlite.close();
  }
});

test("daily history for an owner with no data is today alone", async () => {
  const fixture = createSqliteTestDb();
  try {
    const history = await getDailyHistory(fixture.db, "owner", { now: new Date("2026-09-12T12:00:00Z") });
    assert.equal(history.firstEntryDate, null);
    assert.equal(history.firstWeightDate, null);
    assert.deepEqual(history.days, [{ date: "2026-09-12", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0, weightKg: null }]);
    assert.deepEqual(history.targets, { calories: null, proteinG: null });
  } finally {
    fixture.sqlite.close();
  }
});
