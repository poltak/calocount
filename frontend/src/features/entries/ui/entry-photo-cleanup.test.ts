import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { EntryActionsLogic } from "./entry-actions-logic.js";
import { pngFile, seedEntry } from "./entry-test-helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CURSOR_KEY = "__calocount/photo-cleanup-cursor.json";

// The scheduled cleanup has no route and no page. These tests call the backend
// Logic that the Worker's `scheduled` handler calls, and read what the owner's
// entries and the bucket hold afterwards.
function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new EntryActionsLogic(app.frontend));
}

/** An object of the bucket that no entry uses, uploaded `ageMs` before the backend clock. */
function seedOrphan(app: FullApplication, name: string, ageMs: number) {
  const key = `meals/default/dashboard/new/${name}`;
  app.backend.photoBucket.seed({
    key,
    uploaded: new Date(app.backend.services.clock.now() - ageMs),
  });
  return key;
}

function objectKeys(app: FullApplication) {
  return app.backend.photoBucket.keys().filter((key) => key !== CURSOR_KEY);
}

describe("photo cleanup tests", () => {
  it("should delete only old photos that no entry uses", async () => {
    const app = await setupTest();
    seedOrphan(app, "a-old", 2 * DAY_MS);
    const id = await seedEntry(app, { name: "Photo soup", photo: pngFile() });
    const linked = (
      await app.backend.db
        .selectFrom("mealLogs")
        .select("photoKey")
        .where("id", "=", id)
        .executeTakeFirstOrThrow()
    ).photoKey;
    // The uploaded photo is as old as the orphan: only the entry keeps it.
    app.backend.services.clock.advance(2 * DAY_MS);

    const result = await app.backend.logic.photoCleanup.cleanUp({});

    expect(result).toEqual({
      pages: 1,
      inspected: 2,
      skippedRecent: 0,
      skippedLinked: 1,
      skippedInvalid: 0,
      deleted: 1,
      truncated: false,
    });
    expect(objectKeys(app)).toEqual([linked]);
  });

  it("should keep an orphan that is younger than the grace period", async () => {
    const app = await setupTest();
    const recent = seedOrphan(app, "recent", 2 * 60 * 60 * 1000);
    seedOrphan(app, "old", 25 * 60 * 60 * 1000);

    const result = await app.backend.logic.photoCleanup.cleanUp({});

    expect(result).toMatchObject({ skippedRecent: 1, deleted: 1 });
    expect(objectKeys(app)).toEqual([recent]);
  });

  it("should never use a grace period under one hour", async () => {
    const app = await setupTest();
    const recent = seedOrphan(app, "recent", 10 * 60 * 1000);

    await app.backend.logic.photoCleanup.cleanUp({ gracePeriodMs: 0 });

    expect(objectKeys(app)).toEqual([recent]);
  });

  it("should read the bucket page by page and delete across pages", async () => {
    const app = await setupTest();
    for (const name of ["a", "b", "c", "d", "e"]) {
      seedOrphan(app, name, 2 * DAY_MS);
    }

    const result = await app.backend.logic.photoCleanup.cleanUp({
      pageSize: 2,
    });

    expect(result).toMatchObject({ pages: 3, inspected: 5, deleted: 5 });
    expect(result.truncated).toEqual(false);
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should stop after the page limit, go on at the next run, and clear its place at the end", async () => {
    const app = await setupTest();
    for (const name of ["a", "b", "c", "d", "e"]) {
      seedOrphan(app, name, 2 * DAY_MS);
    }
    const cleanUp = (input: { pageSize: number; maxPages: number }) =>
      app.backend.logic.photoCleanup.cleanUp(input);

    const first = await cleanUp({ pageSize: 2, maxPages: 1 });
    expect(first).toMatchObject({ pages: 1, deleted: 2, truncated: true });
    expect(app.backend.photoBucket.keys()).toContain(CURSOR_KEY);
    expect(objectKeys(app)).toHaveLength(3);

    const second = await cleanUp({ pageSize: 2, maxPages: 5 });
    expect(second).toMatchObject({ deleted: 3, truncated: false });
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should start again from the beginning when the saved place is damaged or stale", async () => {
    const app = await setupTest();
    seedOrphan(app, "a", 2 * DAY_MS);
    await app.backend.photoBucket.put(CURSOR_KEY, "{");

    await app.backend.logic.photoCleanup.cleanUp({});

    expect(objectKeys(app)).toEqual([]);

    seedOrphan(app, "b", 2 * DAY_MS);
    await app.backend.photoBucket.put(
      CURSOR_KEY,
      JSON.stringify({ version: 1, cursor: "gone" }),
    );

    const result = await app.backend.logic.photoCleanup.cleanUp({});

    expect(result).toMatchObject({ deleted: 1 });
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should delete nothing twice when a run fails to save its place, and finish at the next run", async () => {
    const app = await setupTest();
    for (const name of ["a", "b", "c"]) {
      seedOrphan(app, name, 2 * DAY_MS);
    }
    app.backend.photoBucket.failNext("put");

    await expect(
      app.backend.logic.photoCleanup.cleanUp({ pageSize: 2 }),
    ).rejects.toThrow("The bucket failed to put");

    const result = await app.backend.logic.photoCleanup.cleanUp({
      pageSize: 2,
    });
    expect(result.truncated).toEqual(false);
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should keep the objects when a delete fails, and delete them at the next run", async () => {
    const app = await setupTest();
    seedOrphan(app, "a", 2 * DAY_MS);
    app.backend.photoBucket.failNext("delete");

    await expect(app.backend.logic.photoCleanup.cleanUp({})).rejects.toThrow(
      "The bucket failed to delete",
    );
    expect(objectKeys(app)).toHaveLength(1);

    await app.backend.logic.photoCleanup.cleanUp({});
    expect(objectKeys(app)).toEqual([]);
  });

  it("should log a failed scheduled run with a fixed code and no detail", async () => {
    const app = await setupTest();
    app.backend.photoBucket.failNext("list");

    await app.backend.logic.photoCleanup.runScheduled();

    expect(app.backend.services.logger.entries.at(-1)).toEqual({
      level: "error",
      message: "meal_photo_cleanup_error",
      fields: { code: "cleanup_failed" },
    });
  });

  it("should log the counts of a scheduled run", async () => {
    const app = await setupTest();
    seedOrphan(app, "a", 2 * DAY_MS);

    await app.backend.logic.photoCleanup.runScheduled();

    expect(app.backend.services.logger.entries.at(-1)).toMatchObject({
      level: "info",
      message: "meal_photo_cleanup",
      fields: { deleted: 1, pages: 1 },
    });
    expect(objectKeys(app)).toEqual([]);
  });
});
