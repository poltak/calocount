import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../types.js";
import type { SavedEntry } from "../utils/api-types.js";
import { EntryActionsLogic } from "./entry-actions-logic.js";
import {
  HOUR_MS,
  dateAgo,
  readEntryView,
  seedEntry,
  startOfToday,
  todayKey,
} from "./entry-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new EntryActionsLogic(app.frontend));
}

/** Every event that the Logic sends from now on, in order. */
function hearEvents(logic: EntryActionsLogic): EntryEvent[] {
  const heard: EntryEvent[] = [];
  logic.events.listen((event) => {
    heard.push(event);
  });
  return heard;
}

function readMeals(app: FullApplication) {
  return app.backend.db
    .selectFrom("mealLogs")
    .selectAll()
    .orderBy("createdAt")
    .orderBy("id")
    .execute();
}

function readItems(app: FullApplication) {
  return app.backend.db.selectFrom("mealItems").selectAll().execute();
}

/** An entry of yesterday, and its view. */
async function seedYesterdaySoup(app: FullApplication) {
  const id = await seedEntry(app, {
    name: "Yesterday soup",
    calories: 300,
    proteinG: 12,
    consumedAt: startOfToday(app) - 12 * HOUR_MS,
  });
  return {
    id,
    view: await readEntryView(app, id, dateAgo(app, 1)),
  };
}

async function readSavedEntries(app: FullApplication): Promise<SavedEntry[]> {
  const response = await app.frontend.api["saved-entries"].$get();
  if (response.status !== 200) {
    throw new Error("The saved entries were refused");
  }
  return (await response.json()).entries;
}

describe("EntryActionsLogic entry tests", () => {
  it("should delete an entry with its items and its revisions", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, { name: "Apple", calories: 95 });
    const entry = await readEntryView(app, id);
    await app.frontend.api.meals[":id"].$patch({
      param: { id },
      json: { caption: "Fruit" },
    });
    const heard = hearEvents(app.logic);

    const deleteP = app.logic.deleteEntry({ entry });
    expect(app.logic.busy).toEqual(true);
    await deleteP;

    expect(app.logic.state.actState).toEqual("success");
    expect(app.logic.busy).toEqual(false);
    expect(heard).toEqual([
      { type: "entriesChanged", message: "Entry deleted." },
    ]);
    expect(await readMeals(app)).toEqual([]);
    expect(await readItems(app)).toEqual([]);
    expect(
      await app.backend.db.selectFrom("mealRevisions").selectAll().execute(),
    ).toEqual([]);
  });

  it("should ask before it deletes, and keep the entry on a no", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, { name: "Apple" });
    const entry = await readEntryView(app, id);
    app.frontend.services.dialogs.answerWith(false);
    const heard = hearEvents(app.logic);

    await app.logic.deleteEntry({ entry });

    expect(app.frontend.services.dialogs.questions).toEqual([
      'Delete "Apple"? This removes the entry and its analysis data. This cannot be undone.',
    ]);
    expect(app.logic.state.actState).toEqual("pristine");
    expect(heard).toEqual([]);
    expect(await readMeals(app)).toHaveLength(1);
  });

  it("should say that an entry is gone when it was deleted already", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    const entry = await readEntryView(app, id);
    await app.logic.deleteEntry({ entry });
    const heard = hearEvents(app.logic);

    await app.logic.deleteEntry({ entry });

    expect(app.logic.state.actState).toEqual("error");
    expect(app.logic.state.actError).toEqual("Entry not found.");
    expect(heard).toEqual([]);
  });

  it("should copy an entry from an older day to today, and keep the original", async () => {
    const app = await setupTest();
    const { id, view } = await seedYesterdaySoup(app);
    await app.backend.db
      .updateTable("mealLogs")
      .set({
        photoKey: "photos/soup.jpg",
        photoMimeType: "image/jpeg",
        photoSizeBytes: 9,
      })
      .execute();
    const heard = hearEvents(app.logic);

    await app.logic.copyEntryToToday({ entry: view, today: todayKey(app) });

    expect(heard).toEqual([
      { type: "entriesChanged", message: "Copied “Yesterday soup” to today." },
    ]);
    const meals = await readMeals(app);
    expect(meals).toHaveLength(2);
    const copy = meals.find((meal) => meal.id !== id);
    expect(copy).toMatchObject({
      totalCalories: 300,
      totalProteinG: 12,
      source: "dashboard",
      photoKey: "photos/soup.jpg",
    });
    expect(new Date(copy?.consumedAt ?? 0).toISOString().slice(0, 10)).toEqual(
      todayKey(app),
    );
    expect(meals.find((meal) => meal.id === id)?.consumedAt).toEqual(
      view.consumedAt,
    );
    const items = await readItems(app);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.id)).size).toEqual(2);
    expect(items.map((item) => item.mealId).toSorted()).toEqual(
      meals.map((meal) => meal.id).toSorted(),
    );
  });

  it("should duplicate an entry at its own time", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, {
      name: "Soup",
      consumedAt: startOfToday(app) + 9 * HOUR_MS,
      items: [{ name: "Soup", calories: 150, fiberG: 3, sodiumMg: 0 }],
    });
    const entry = await readEntryView(app, id);
    const heard = hearEvents(app.logic);

    await app.logic.duplicateEntry({ entry });

    expect(heard).toEqual([
      { type: "entriesChanged", message: "Duplicated “Soup”." },
    ]);
    const meals = await readMeals(app);
    expect(meals.map((meal) => meal.consumedAt)).toEqual([
      entry.consumedAt,
      entry.consumedAt,
    ]);
    expect(meals.map((meal) => meal.totalCalories)).toEqual([150, 150]);
    expect(await readItems(app)).toMatchObject([
      { fiberG: 3, sodiumMg: 0, calciumMg: null },
      { fiberG: 3, sodiumMg: 0, calciumMg: null },
    ]);
  });

  it("should say that the entry is gone when a copy cannot find it", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    const entry = await readEntryView(app, id);
    await app.logic.deleteEntry({ entry });

    await app.logic.duplicateEntry({ entry });

    expect(app.logic.state.actError).toEqual("Entry not found.");
  });

  it("should show the error when the backend cannot be reached", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    const entry = await readEntryView(app, id);
    app.transport.failNextRequestAtGateway(503);

    await app.logic.deleteEntry({ entry });

    expect(app.logic.state.actState).toEqual("error");
    expect(app.logic.state.actError).toEqual("Request failed with status 503");
    expect(await readMeals(app)).toHaveLength(1);
  });
});

describe("EntryActionsLogic saved entry tests", () => {
  it("should save an entry for later", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, {
      name: "Audit lunch",
      calories: 500,
      proteinG: 30,
    });
    const entry = await readEntryView(app, id);
    const heard = hearEvents(app.logic);

    await app.logic.saveForLater({ entry });

    expect(heard).toEqual([
      { type: "savedEntriesChanged", message: "Added to saved entries." },
    ]);
    expect(await readSavedEntries(app)).toMatchObject([
      {
        sourceEntryId: id,
        totalCalories: 500,
        totalProteinG: 30,
        items: [{ name: "Audit lunch" }],
      },
    ]);
  });

  it("should keep one saved entry for an entry that the owner saves again, with the newest values", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, { name: "Audit lunch", calories: 500 });
    await app.logic.saveForLater({ entry: await readEntryView(app, id) });
    await app.frontend.api.meals[":id"].$patch({
      param: { id },
      json: { items: [{ name: "Audit lunch", calories: 700 }] },
    });

    await app.logic.saveForLater({ entry: await readEntryView(app, id) });

    expect(await readSavedEntries(app)).toMatchObject([{ totalCalories: 700 }]);
  });

  it("should remove a saved entry", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    await app.logic.saveForLater({ entry: await readEntryView(app, id) });
    const [saved] = await readSavedEntries(app);
    const heard = hearEvents(app.logic);

    await app.logic.removeSaved({ saved: saved as SavedEntry });

    expect(heard).toEqual([
      { type: "savedEntriesChanged", message: "Removed from saved entries." },
    ]);
    expect(await readSavedEntries(app)).toEqual([]);
    expect(await readMeals(app)).toHaveLength(1);
  });

  it("should say that a saved entry is gone when it was removed already", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    await app.logic.saveForLater({ entry: await readEntryView(app, id) });
    const [saved] = await readSavedEntries(app);
    await app.logic.removeSaved({ saved: saved as SavedEntry });

    await app.logic.removeSaved({ saved: saved as SavedEntry });

    expect(app.logic.state.actError).toEqual("Saved entry not found.");
  });

  it("should say that an entry is gone when it cannot be saved", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    const entry = await readEntryView(app, id);
    await app.backend.db.deleteFrom("mealItems").execute();
    await app.backend.db.deleteFrom("mealLogs").execute();

    await app.logic.saveForLater({ entry });

    expect(app.logic.state.actError).toEqual("Entry not found.");
  });

  it("should track a saved entry as it was, after its source changed and went", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, {
      name: "Audit lunch",
      calories: 500,
      proteinG: 30,
    });
    const entry = await readEntryView(app, id);
    await app.logic.saveForLater({ entry });
    await app.frontend.api.meals[":id"].$patch({
      param: { id },
      json: { items: [{ name: "Audit lunch", calories: 700 }] },
    });
    await app.logic.deleteEntry({ entry });
    const [saved] = await readSavedEntries(app);
    const heard = hearEvents(app.logic);

    await app.logic.trackSaved({
      saved: saved as SavedEntry,
      today: todayKey(app),
    });

    expect(heard).toEqual([
      {
        type: "entriesChanged",
        message: "Tracked “Audit lunch”.",
        date: todayKey(app),
      },
    ]);
    expect(await readMeals(app)).toMatchObject([
      {
        totalCalories: 500,
        totalProteinG: 30,
        source: "saved-entry",
        savedEntryId: saved?.id,
      },
    ]);
  });

  it("should say that a saved entry is gone when it cannot be tracked", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    await app.logic.saveForLater({ entry: await readEntryView(app, id) });
    const [saved] = await readSavedEntries(app);
    await app.logic.removeSaved({ saved: saved as SavedEntry });

    await app.logic.trackSaved({
      saved: saved as SavedEntry,
      today: todayKey(app),
    });

    expect(app.logic.state.actError).toEqual("Saved entry not found.");
    expect(await readMeals(app)).toHaveLength(1);
  });

  it("should leave out a saved entry whose stored text is damaged", async () => {
    const app = await setupTest();
    const id = await seedEntry(app);
    await app.logic.saveForLater({ entry: await readEntryView(app, id) });
    await app.backend.db
      .updateTable("savedEntries")
      .set({ snapshotJson: "{" })
      .execute();

    expect(await readSavedEntries(app)).toEqual([]);
  });
});
