import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migration = await readFile(new URL("../drizzle/0000_flippant_natasha_romanoff.sql", import.meta.url), "utf8");

test("D1 migration contains the app data tables", () => {
  for (const table of [
    "settings",
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
});
