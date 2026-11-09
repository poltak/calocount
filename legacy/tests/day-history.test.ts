import assert from "node:assert/strict";
import test from "node:test";

import { getDayLog, getMonthTotals } from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

type Fixture = ReturnType<typeof createSqliteTestDb>;

function insertMeal(fixture: Fixture, id: string, eatenAt: string, calories: number, { ownerKey = "owner", status = "complete" } = {}) {
  fixture.sqlite.prepare(`
    INSERT INTO meal_logs (id, owner_key, consumed_at, status, total_calories, total_protein_g, total_carbs_g, total_fat_g)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerKey, Date.parse(eatenAt), status, calories, calories / 20, calories / 10, calories / 40);
  fixture.sqlite.prepare("INSERT INTO meal_items (id, meal_id, owner_key, name, calories) VALUES (?, ?, ?, ?, ?)")
    .run(`item-${id}`, id, ownerKey, `Item of ${id}`, calories);
}

function insertWeight(fixture: Fixture, logicalDate: string, weightKg: number, ownerKey = "owner") {
  fixture.sqlite.prepare("INSERT INTO daily_weights (id, owner_key, logical_date, weight_kg, recorded_at) VALUES (?, ?, ?, ?, ?)")
    .run(`weight-${ownerKey}-${logicalDate}`, ownerKey, logicalDate, weightKg, Date.parse(`${logicalDate}T01:00:00Z`));
}

test("month totals group complete entries into days of the requested timezone", async () => {
  const fixture = createSqliteTestDb();
  try {
    // 06:30 on 1 August in Ho Chi Minh City is 23:30 on 31 July in UTC.
    insertMeal(fixture, "first-of-august", "2026-07-31T23:30:00Z", 400);
    insertMeal(fixture, "lunch", "2026-08-20T05:00:00Z", 700.1);
    insertMeal(fixture, "snack", "2026-08-20T08:00:00Z", 100.2);
    // 00:30 on 1 September there. It belongs to the next month.
    insertMeal(fixture, "first-of-september", "2026-08-31T17:30:00Z", 650);
    insertMeal(fixture, "pending", "2026-08-20T06:00:00Z", 999, { status: "pending" });
    insertMeal(fixture, "foreign", "2026-08-10T06:00:00Z", 999, { ownerKey: "other-owner" });
    insertMeal(fixture, "long-ago", "2024-01-15T12:00:00Z", 500);
    insertWeight(fixture, "2023-12-30", 70.4);
    insertWeight(fixture, "2020-01-01", 80, "other-owner");

    const august = await getMonthTotals({ db: fixture.db, ownerKey: "owner", month: "2026-08", timezone: "Asia/Ho_Chi_Minh" });

    assert.equal(august.month, "2026-08");
    assert.equal(august.timezone, "Asia/Ho_Chi_Minh");
    assert.equal(august.firstDate, "2023-12-30");
    assert.deepEqual(august.days.map((day) => [day.date, day.mealCount]), [["2026-08-01", 1], ["2026-08-20", 2]]);
    assert.ok(Math.abs(august.days[1].calories - 800.3) < 1e-6);
    assert.ok(Math.abs(august.days[1].proteinG - 40.015) < 1e-6);

    // The same moments fall on other days in UTC.
    const utcAugust = await getMonthTotals({ db: fixture.db, ownerKey: "owner", month: "2026-08" });
    assert.deepEqual(utcAugust.days.map((day) => [day.date, day.mealCount]), [["2026-08-20", 2], ["2026-08-31", 1]]);

    const december = await getMonthTotals({ db: fixture.db, ownerKey: "owner", month: "2026-12", timezone: "Asia/Ho_Chi_Minh" });
    assert.deepEqual(december.days, []);
    assert.ok(fixture.queries.every(({ values }) => values.length <= 100));
  } finally {
    fixture.sqlite.close();
  }
});

test("month totals keep meals on the right day when the clocks change in the month", async () => {
  const fixture = createSqliteTestDb();
  try {
    // New York is 5 hours behind UTC until 02:00 on 8 March 2026, then 4 hours behind.
    insertMeal(fixture, "before-change", "2026-03-08T04:30:00Z", 100); // 23:30 on 7 March
    insertMeal(fixture, "after-change", "2026-03-09T03:30:00Z", 300); // 23:30 on 8 March
    insertMeal(fixture, "next-day", "2026-03-09T04:30:00Z", 400); // 00:30 on 9 March

    const march = await getMonthTotals({ db: fixture.db, ownerKey: "owner", month: "2026-03", timezone: "America/New_York" });

    assert.deepEqual(march.days.map((day) => [day.date, day.calories]), [["2026-03-07", 100], ["2026-03-08", 300], ["2026-03-09", 400]]);
    assert.equal(march.firstDate, "2026-03-07");
  } finally {
    fixture.sqlite.close();
  }
});

test("month totals for an owner with no data have no days and no first date", async () => {
  const fixture = createSqliteTestDb();
  try {
    const month = await getMonthTotals({ db: fixture.db, ownerKey: "owner", month: "2026-09" });
    assert.deepEqual(month, { month: "2026-09", timezone: "UTC", firstDate: null, days: [] });
  } finally {
    fixture.sqlite.close();
  }
});

test("a day log holds the entries, items and weight of that day in the requested timezone", async () => {
  const fixture = createSqliteTestDb();
  try {
    insertMeal(fixture, "day-before", "2026-08-19T16:59:00Z", 300); // 23:59 on 19 August in Ho Chi Minh City
    insertMeal(fixture, "breakfast", "2026-08-19T17:00:00Z", 400); // 00:00 on 20 August
    insertMeal(fixture, "dinner", "2026-08-20T12:00:00Z", 700);
    insertMeal(fixture, "pending", "2026-08-20T13:00:00Z", 50, { status: "pending" });
    insertMeal(fixture, "day-after", "2026-08-20T17:00:00Z", 900); // 00:00 on 21 August
    insertMeal(fixture, "foreign", "2026-08-20T06:00:00Z", 999, { ownerKey: "other-owner" });
    insertWeight(fixture, "2026-08-20", 71.2);
    insertWeight(fixture, "2026-08-20", 90, "other-owner");

    const day = await getDayLog({ db: fixture.db, ownerKey: "owner", date: "2026-08-20", timezone: "Asia/Ho_Chi_Minh" });

    assert.equal(day.date, "2026-08-20");
    assert.equal(day.timezone, "Asia/Ho_Chi_Minh");
    // Newest first, as in the dashboard summary. An entry that is not complete yet is still listed.
    assert.deepEqual(day.meals.map(({ meal }) => meal.id), ["pending", "dinner", "breakfast"]);
    assert.deepEqual(day.meals.map(({ items }) => items.map((item) => item.name)), [["Item of pending"], ["Item of dinner"], ["Item of breakfast"]]);
    assert.equal(day.weight?.weightKg, 71.2);
    assert.deepEqual(day.proteinGoal, { date: "2026-08-20", targetG: null, weightKg: null, weightDate: null });

    const emptyDay = await getDayLog({ db: fixture.db, ownerKey: "owner", date: "2026-08-10", timezone: "Asia/Ho_Chi_Minh" });
    assert.deepEqual(emptyDay.meals, []);
    assert.equal(emptyDay.weight, null);
  } finally {
    fixture.sqlite.close();
  }
});

test("a day log resolves a weight-based protein goal from the latest weight on or before the day", async () => {
  const fixture = createSqliteTestDb();
  try {
    fixture.sqlite.prepare("INSERT INTO settings (id, owner_key, protein_goal_mode, daily_protein_target_per_kg) VALUES ('settings', 'owner', 'gramsPerKg', 2)").run();
    insertWeight(fixture, "2026-08-01", 70);
    insertWeight(fixture, "2026-08-20", 72);
    insertWeight(fixture, "2026-09-01", 80);

    const onWeightDay = await getDayLog({ db: fixture.db, ownerKey: "owner", date: "2026-08-20" });
    assert.deepEqual(onWeightDay.proteinGoal, { date: "2026-08-20", targetG: 144, weightKg: 72, weightDate: "2026-08-20" });

    const betweenWeights = await getDayLog({ db: fixture.db, ownerKey: "owner", date: "2026-08-10" });
    assert.equal(betweenWeights.weight, null);
    assert.deepEqual(betweenWeights.proteinGoal, { date: "2026-08-10", targetG: 140, weightKg: 70, weightDate: "2026-08-01" });

    const beforeAnyWeight = await getDayLog({ db: fixture.db, ownerKey: "owner", date: "2026-07-01" });
    assert.deepEqual(beforeAnyWeight.proteinGoal, { date: "2026-07-01", targetG: null, weightKg: null, weightDate: null });
  } finally {
    fixture.sqlite.close();
  }
});
