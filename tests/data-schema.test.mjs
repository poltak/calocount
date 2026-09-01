import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migration = (await Promise.all(
  (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFile(new URL(file, migrationDirectory), "utf8")),
)).join("\n");

test("D1 migration contains the app data tables", () => {
  for (const table of [
    "settings",
    "daily_weights",
    "meal_logs",
    "meal_items",
    "analysis_jobs",
    "meal_revisions",
    "ai_profiles",
    "ai_runs",
    "telegram_updates",
  ]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
});

test("D1 migration indexes recent meals and pending jobs", () => {
  assert.match(migration, /meal_logs_owner_consumed_at_idx/);
  assert.match(migration, /analysis_jobs_owner_state_available_idx/);
  assert.match(migration, /telegram_updates_owner_update_idx/);
  assert.match(migration, /daily_weights_owner_date_idx/);
});

test("D1 migration stores optional nutrient goals and item nutrients", () => {
  assert.match(migration, /ALTER TABLE `settings` ADD `nutrient_targets_json` text/);
  for (const column of ["fiber_g", "total_sugars_g", "saturated_fat_g", "vitamin_c_mg", "selenium_mcg", "caffeine_mg"]) {
    assert.match(migration, new RegExp("ADD `" + column + "` real"));
  }
});
