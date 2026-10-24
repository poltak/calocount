import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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
    "goal_changes",
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

test("settings store the goals, reference opt-ins and public view, and meal items store every nutrient", () => {
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
    "public_view_enabled",
  ]) {
    assert.ok(settings.includes(column), column);
  }
  const snakeCase = (key: string) => key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`).replace(/(\d+)/gu, "$1");
  for (const key of [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS]) {
    assert.ok(mealItems.includes(snakeCase(key)), `${key} -> ${snakeCase(key)}`);
  }
  assert.ok(mealItems.includes("nutrient_provenance_json"));
});

test("the public view migration keeps existing owners public and starts a new owner private", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const directory = new URL("../drizzle/", import.meta.url);
    const migrations = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
    const target = migrations.indexOf("0014_public_view.sql");
    assert.ok(target > 0, "the public view migration exists");
    for (const file of migrations.slice(0, target)) sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
    sqlite.exec("INSERT INTO settings (id, owner_key) VALUES ('settings_existing', 'existing')");
    for (const file of migrations.slice(target)) sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
    sqlite.exec("INSERT INTO settings (id, owner_key) VALUES ('settings_new', 'new')");
    const rows = sqlite.prepare("SELECT owner_key, public_view_enabled FROM settings ORDER BY owner_key").all();
    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { owner_key: "existing", public_view_enabled: 1 },
      { owner_key: "new", public_view_enabled: 0 },
    ]);
  } finally {
    sqlite.close();
  }
});
