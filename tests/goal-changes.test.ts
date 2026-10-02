import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { getDailyHistory, getExportData, getNutritionSummary, listGoalChanges, upsertSettings } from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

const OWNER = "owner";

test("saving settings records a goal change only when a goal that applies changes", async () => {
  const fixture = createSqliteTestDb();
  try {
    await upsertSettings(fixture.db, OWNER, { dailyCalorieTarget: 2_100, dailyProteinTargetG: 140 });
    // None of these changes a goal that applies: the per-kilogram value has no effect in grams mode.
    await upsertSettings(fixture.db, OWNER, { timezone: "Asia/Ho_Chi_Minh" });
    await upsertSettings(fixture.db, OWNER, { dailyCalorieTarget: 2_100, dailyProteinTargetG: 140, proteinGoalMode: "grams" });
    await upsertSettings(fixture.db, OWNER, { dailyProteinTargetPerKg: 1.8 });
    assert.equal((await listGoalChanges(fixture.db, OWNER)).length, 1);

    await upsertSettings(fixture.db, OWNER, { dailyCalorieTarget: 1_900 });
    await upsertSettings(fixture.db, OWNER, { proteinGoalMode: "gramsPerKg", dailyProteinTargetPerKg: 2 });
    await upsertSettings(fixture.db, OWNER, { dailyCalorieTarget: null });
    await upsertSettings(fixture.db, "other-owner", { dailyCalorieTarget: 3_000 });

    const changes = await listGoalChanges(fixture.db, OWNER);
    assert.deepEqual(changes.map((change) => [change.dailyCalorieTarget, change.proteinGoalMode, change.dailyProteinTargetG, change.dailyProteinTargetPerKg]), [
      [2_100, "grams", 140, null],
      [1_900, "grams", 140, null],
      [1_900, "gramsPerKg", null, 2],
      [null, "gramsPerKg", null, 2],
    ]);
    assert.ok(changes.every((change, index) => index === 0 || change.changedAt >= changes[index - 1].changedAt));
    // The settings keep the value of the mode that is not selected.
    const saved = fixture.sqlite.prepare("SELECT daily_protein_target_g AS grams FROM settings WHERE owner_key = ?").get(OWNER);
    assert.equal(saved?.grams, 140);
  } finally {
    fixture.sqlite.close();
  }
});

test("only the latest 50 goal changes are listed", async () => {
  const fixture = createSqliteTestDb();
  try {
    const insert = fixture.sqlite.prepare("INSERT INTO goal_changes (id, owner_key, changed_at, daily_calorie_target) VALUES (?, ?, ?, ?)");
    for (let index = 0; index < 60; index += 1) insert.run(`goal-${index}`, OWNER, 1_000 + index, 2_000 + index);
    const changes = await listGoalChanges(fixture.db, OWNER);
    assert.equal(changes.length, 50);
    assert.equal(changes[0].dailyCalorieTarget, 2_010);
    assert.equal(changes.at(-1)?.dailyCalorieTarget, 2_059);
  } finally {
    fixture.sqlite.close();
  }
});

test("the daily history, the nutrition summary and the export carry the goal changes", async () => {
  const fixture = createSqliteTestDb();
  try {
    fixture.sqlite.exec("INSERT INTO settings (id, owner_key, timezone, daily_calorie_target) VALUES ('settings', 'owner', 'Asia/Ho_Chi_Minh', 1900)");
    const insert = fixture.sqlite.prepare("INSERT INTO goal_changes (id, owner_key, changed_at, daily_calorie_target, protein_goal_mode, daily_protein_target_g, daily_protein_target_per_kg) VALUES (?, ?, ?, ?, ?, ?, ?)");
    // 01:00 on 2 September in Ho Chi Minh City. The migration can leave both protein values on a baseline row.
    insert.run("goal-1", OWNER, Date.parse("2026-09-01T18:00:00Z"), 2_100, "gramsPerKg", 140, 2);
    insert.run("goal-2", OWNER, Date.parse("2026-09-20T03:00:00Z"), 1_900, "grams", 140, 2);
    insert.run("goal-foreign", "other-owner", Date.parse("2026-09-10T03:00:00Z"), 3_000, "grams", null, null);

    const history = await getDailyHistory(fixture.db, OWNER, { now: new Date("2026-09-21T03:00:00Z") });
    assert.deepEqual(history.goalChanges, [
      { date: "2026-09-02", changedAt: Date.parse("2026-09-01T18:00:00Z"), dailyCalorieTarget: 2_100, proteinGoalMode: "gramsPerKg", dailyProteinTargetG: null, dailyProteinTargetPerKg: 2 },
      { date: "2026-09-20", changedAt: Date.parse("2026-09-20T03:00:00Z"), dailyCalorieTarget: 1_900, proteinGoalMode: "grams", dailyProteinTargetG: 140, dailyProteinTargetPerKg: null },
    ]);

    const summary = await getNutritionSummary({
      db: fixture.db, ownerKey: OWNER, startDate: "2026-09-20", endDate: "2026-09-20",
      from: Date.parse("2026-09-20T00:00:00Z"), to: Date.parse("2026-09-21T00:00:00Z"), dayCount: 1,
    });
    assert.deepEqual(summary.goalChanges, [
      { date: "2026-09-01", changedAt: "2026-09-01T18:00:00.000Z", caloriesKcal: 2_100, protein: { mode: "gramsPerKg", grams: null, gramsPerKg: 2 } },
      { date: "2026-09-20", changedAt: "2026-09-20T03:00:00.000Z", caloriesKcal: 1_900, protein: { mode: "grams", grams: 140, gramsPerKg: null } },
    ]);

    const exported = await getExportData({ db: fixture.db, ownerKey: OWNER });
    assert.deepEqual(exported.goalChanges.map((change) => change.id), ["goal-2", "goal-1"]);
  } finally {
    fixture.sqlite.close();
  }
});

test("the goal changes migration starts each owner's history from the saved settings", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const directory = new URL("../drizzle/", import.meta.url);
    const files = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
    const migration = files.findIndex((file) => file.endsWith("_goal_changes.sql"));
    assert.ok(migration > 0);
    for (const file of files.slice(0, migration)) sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
    sqlite.exec(`
      INSERT INTO settings (id, owner_key, daily_calorie_target, protein_goal_mode, daily_protein_target_g, daily_protein_target_per_kg, updated_at)
      VALUES ('settings_a', 'owner-a', 2100, 'gramsPerKg', 140, 2, 1788000000000), ('settings_b', 'owner-b', NULL, 'grams', NULL, NULL, 1789000000000)
    `);
    sqlite.exec(readFileSync(new URL(files[migration], directory), "utf8"));

    const rows = sqlite.prepare("SELECT owner_key, changed_at, daily_calorie_target, protein_goal_mode, daily_protein_target_g, daily_protein_target_per_kg FROM goal_changes ORDER BY owner_key").all();
    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { owner_key: "owner-a", changed_at: 1_788_000_000_000, daily_calorie_target: 2_100, protein_goal_mode: "gramsPerKg", daily_protein_target_g: 140, daily_protein_target_per_kg: 2 },
      { owner_key: "owner-b", changed_at: 1_789_000_000_000, daily_calorie_target: null, protein_goal_mode: "grams", daily_protein_target_g: null, daily_protein_target_per_kg: null },
    ]);
  } finally {
    sqlite.close();
  }
});
