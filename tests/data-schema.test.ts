import assert from "node:assert/strict";
import { test } from "node:test";

import { NUTRIENT_KEYS, NUTRIENT_UPPER_LIMIT_KEYS } from "../domain/nutrients";
import { createSqliteTestDb } from "./helpers/sqlite-db";

/** Apply every migration to an empty database and read back what exists. */
function migratedSchema() {
  const fixture = createSqliteTestDb();
  try {
    const names = (type: string) => (fixture.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all(type) as Array<{ name: string }>).map((row) => row.name);
    const columns = (table: string) => (fixture.sqlite
      .prepare(`SELECT name FROM pragma_table_info('${table}')`)
      .all() as Array<{ name: string }>).map((row) => row.name);
    return {
      tables: names("table"),
      indexes: names("index"),
      settings: columns("settings"),
      mealItems: columns("meal_items"),
    };
  } finally {
    fixture.sqlite.close();
  }
}

test("the migrations create exactly the tables the app uses", () => {
  assert.deepEqual(migratedSchema().tables, [
    "ai_profiles",
    "ai_runs",
    "analysis_jobs",
    "daily_weights",
    "meal_items",
    "meal_logs",
    "meal_revisions",
    "saved_entries",
    "settings",
    "share_links",
  ]);
});

test("the migrations index recent meals, photos, weights and saved entries", () => {
  const { indexes } = migratedSchema();
  for (const index of [
    "meal_logs_owner_consumed_at_idx",
    "meal_logs_photo_key_owner_idx",
    "meal_logs_external_request_id_idx",
    "meal_items_owner_meal_id_idx",
    "daily_weights_owner_date_idx",
    "saved_entries_owner_source_idx",
  ]) {
    assert.ok(indexes.includes(index), index);
  }
});

test("settings store the goals and reference opt-ins, and meal items store every nutrient", () => {
  const { settings, mealItems } = migratedSchema();
  for (const column of [
    "timezone",
    "daily_calorie_target",
    "daily_protein_target_g",
    "protein_goal_mode",
    "daily_protein_target_per_kg",
    "nutrient_targets_json",
    "vitamin_b6_us_fnb_adult_ul_enabled",
    "us_fnb_adult_ul_enabled",
  ]) {
    assert.ok(settings.includes(column), column);
  }
  const snakeCase = (key: string) => key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`).replace(/(\d+)/gu, "$1");
  for (const key of [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS]) {
    assert.ok(mealItems.includes(snakeCase(key)), `${key} -> ${snakeCase(key)}`);
  }
  assert.ok(mealItems.includes("nutrient_provenance_json"));
});
