import assert from "node:assert/strict";
import test from "node:test";

import {
  createMeal,
  copyMeal,
  deleteMeal,
  listSavedEntries,
  removeSavedEntry,
  saveEntry,
  trackSavedEntry,
  updateMeal,
} from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

test("saved entries are empty by default and isolated by owner", async () => {
  const { db } = createSqliteTestDb();
  assert.deepEqual(await listSavedEntries(db, "owner-a"), []);

  const source = await createMeal(db, "owner-a", {
    caption: "Morning coffee",
    mealType: "snack",
    items: [{ name: "Flat white", calories: 120, proteinG: 6, caffeineMg: 95 }],
  });
  assert.equal(await saveEntry(db, "owner-b", source.meal.id), null);
  assert.ok(await saveEntry(db, "owner-a", source.meal.id));
  assert.deepEqual(await listSavedEntries(db, "owner-b"), []);
});

test("saved entries are independent snapshots and can be tracked repeatedly", async () => {
  const { db } = createSqliteTestDb();
  const source = await createMeal(db, "owner-a", {
    caption: "Morning coffee",
    mealType: "snack",
    items: [{ name: "Flat white", calories: 120, proteinG: 6, caffeineMg: 95 }],
  });
  const saved = await saveEntry(db, "owner-a", source.meal.id);
  assert.ok(saved);

  const duplicateSave = await saveEntry(db, "owner-a", source.meal.id);
  assert.equal(duplicateSave?.id, saved.id);
  assert.equal((await listSavedEntries(db, "owner-a")).length, 1);

  await updateMeal(db, "owner-a", source.meal.id, {
    caption: "Changed later",
    items: [{ name: "Different drink", calories: 10, caffeineMg: 5 }],
  });
  await deleteMeal(db, "owner-a", source.meal.id);

  const first = await trackSavedEntry(db, "owner-a", saved.id, 1_800_000_000_000);
  const second = await trackSavedEntry(db, "owner-a", saved.id, 1_800_000_001_000);
  assert.ok(first && second);
  assert.notEqual(first.meal.id, second.meal.id);
  assert.equal(first.meal.caption, "Morning coffee");
  assert.equal(first.meal.savedEntryId, saved.id);
  assert.equal(first.meal.totalCalories, 120);
  assert.equal(first.items[0]?.caffeineMg, 95);
  assert.equal(first.items[0]?.id === saved.snapshot.items[0]?.id, false);

  const duplicate = await copyMeal(db, "owner-a", first.meal.id);
  assert.equal(duplicate?.meal.savedEntryId, saved.id);

  assert.equal(await removeSavedEntry(db, "owner-b", saved.id), false);
  assert.equal(await removeSavedEntry(db, "owner-a", saved.id), true);
  assert.deepEqual(await listSavedEntries(db, "owner-a"), []);
});
