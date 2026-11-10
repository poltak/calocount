import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../types.js";
import { EntryActionsLogic } from "./entry-actions-logic.js";
import {
  HOUR_MS,
  dateAgo,
  pngFile,
  readEntryView,
  seedEntry,
  startOfToday,
  todayKey,
} from "./entry-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new EntryActionsLogic(app.frontend));
}

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

/** An entry of yesterday with a photo. */
async function seedPhotoSoup(app: FullApplication) {
  const id = await seedEntry(app, {
    name: "Photo soup",
    consumedAt: startOfToday(app) - 12 * HOUR_MS,
    photo: pngFile(),
  });
  return { id, view: await readEntryView(app, id, dateAgo(app, 1)) };
}

describe("EntryActionsLogic photo tests", () => {
  it("should delete an entry and the object of its photo", async () => {
    const app = await setupTest();
    const { view } = await seedPhotoSoup(app);
    const heard = hearEvents(app.logic);
    expect(app.backend.photoBucket.keys()).toHaveLength(1);

    await app.logic.deleteEntry({ entry: view });

    expect(await readMeals(app)).toEqual([]);
    expect(app.backend.photoBucket.keys()).toEqual([]);
    expect(heard).toEqual([
      { type: "entriesChanged", message: "Entry deleted." },
    ]);
  });

  it("should delete an entry whose photo cannot be removed, and say so", async () => {
    const app = await setupTest();
    const { view } = await seedPhotoSoup(app);
    const heard = hearEvents(app.logic);
    app.backend.photoBucket.failNext("delete");

    await app.logic.deleteEntry({ entry: view });

    expect(app.logic.state.actState).toEqual("success");
    expect(await readMeals(app)).toEqual([]);
    // The object stays for the scheduled cleanup.
    expect(app.backend.photoBucket.keys()).toHaveLength(1);
    expect(heard).toEqual([
      {
        type: "entriesChanged",
        message: "Entry deleted. Its photo could not be removed.",
      },
    ]);
  });

  it("should keep the photo of a copy after the original entry goes, until the last reference goes", async () => {
    const app = await setupTest();
    const { id, view } = await seedPhotoSoup(app);

    await app.logic.copyEntryToToday({ entry: view, today: todayKey(app) });
    await app.logic.duplicateEntry({ entry: view });
    const [original, ...copies] = await readMeals(app);
    expect(copies).toHaveLength(2);
    expect(copies.map((copy) => copy.photoKey)).toEqual([
      original?.photoKey,
      original?.photoKey,
    ]);

    await app.logic.deleteEntry({ entry: view });
    expect((await readMeals(app)).some((meal) => meal.id === id)).toEqual(
      false,
    );
    expect(app.backend.photoBucket.keys()).toEqual([original?.photoKey]);

    for (const copy of copies) {
      const entry = await readEntryView(
        app,
        copy.id,
        copy.consumedAt < startOfToday(app) ? dateAgo(app, 1) : todayKey(app),
      );
      await app.logic.deleteEntry({ entry });
    }

    expect(await readMeals(app)).toEqual([]);
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });
});
