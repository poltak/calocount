import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardSummary } from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

test("dashboard totals include more than 500 meals and keep missing nutrients distinct from zero", async () => {
  const fixture = createSqliteTestDb();
  try {
    const now = new Date("2026-09-12T12:00:00Z");
    const insertMeal = fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at, status, total_calories) VALUES (?, ?, ?, ?, ?)");
    const insertItem = fixture.sqlite.prepare("INSERT INTO meal_items (id, meal_id, owner_key, name, fiber_g) VALUES (?, ?, ?, ?, ?)");
    for (let index = 0; index < 501; index++) {
      insertMeal.run(`meal-${index}`, "owner", now.getTime() - index, "complete", 100);
      insertItem.run(`item-${index}`, `meal-${index}`, "owner", "Meal", index === 0 ? null : 2);
    }
    insertMeal.run("pending", "owner", now.getTime(), "pending", 999);
    insertMeal.run("foreign", "other-owner", now.getTime(), "complete", 999);
    insertItem.run("foreign-item", "meal-0", "other-owner", "Wrong owner", 999);
    const summary = await getDashboardSummary(fixture.db, "owner", { now });
    assert.equal(summary.today.calories, 50_100);
    assert.equal(summary.trend.byDate.at(-1)?.calories, 50_100);
    assert.equal(summary.sevenDay.calories, 50_100);
    assert.equal(summary.today.mealCount, 501);
    assert.equal(summary.recentMeals.length, 502);
    assert.deepEqual(summary.nutrition.today.fiberG, { amount: 1000, knownItemCount: 500, totalItemCount: 501, complete: false });
    assert.equal(fixture.queries.length, 5);
    assert.ok(fixture.queries.every(({ values }) => values.length <= 100));
  } finally {
    fixture.sqlite.close();
  }
});

test("dashboard grouping converts each meal date once", async () => {
  const fixture = createSqliteTestDb();
  const original = Intl.DateTimeFormat.prototype.formatToParts;
  let conversions = 0;
  try {
    const now = new Date("2026-09-12T12:00:00Z");
    const insert = fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at, status) VALUES (?, ?, ?, ?)");
    for (let index = 0; index < 500; index++) {
      insert.run(`meal-${index}`, "owner", now.getTime() - (index % 30) * 86_400_000, "complete");
    }
    Intl.DateTimeFormat.prototype.formatToParts = function (date) {
      conversions++;
      return original.call(this, date);
    };
    const summary = await getDashboardSummary(fixture.db, "owner", { now, timezone: "Asia/Ho_Chi_Minh" });
    assert.equal(summary.trend.byDate.reduce((count, day) => count + day.mealCount, 0), 500);
    assert.ok(conversions < 650, `Expected one conversion per meal plus date bounds; got ${conversions}`);
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = original;
    fixture.sqlite.close();
  }
});
