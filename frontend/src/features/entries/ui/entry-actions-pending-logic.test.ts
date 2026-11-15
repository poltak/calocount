import { describe, expect, it, vi } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
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

const NO_CONNECTION =
  "No connection. Check your internet connection and try again.";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new EntryActionsLogic(app.frontend));
}

/**
 * Stands in for the dashboard: the Logic waits for what its listeners return.
 * `heard` counts the events, and `finishRead` ends the read.
 */
function holdDashboardRead(logic: EntryActionsLogic) {
  let heard = 0;
  let finishRead!: () => void;
  const read = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  logic.events.listen(async () => {
    heard += 1;
    await read;
  });
  return { heard: () => heard, finishRead };
}

/** Keep an entry as a saved entry through the API, and return the saved entry. */
async function seedSavedEntry(
  app: Pick<FullApplication, "frontend">,
  sourceEntryId: string,
): Promise<SavedEntry> {
  const { frontend } = app;
  const created = await frontend.api["saved-entries"].$post({
    json: { sourceEntryId },
  });
  if (created.status !== 201) {
    throw new Error(`The saved entry was refused: ${created.status}`);
  }
  const response = await frontend.api["saved-entries"].$get();
  if (response.status !== 200) {
    throw new Error(`The saved entries were refused: ${response.status}`);
  }
  const [saved] = (await response.json()).entries;
  if (!saved) {
    throw new Error("The saved entry is missing");
  }
  return saved;
}

describe("EntryActionsLogic pending row tests", () => {
  it("should show a row for a duplicate until the dashboard has read again", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, {
      name: "Soup",
      consumedAt: startOfToday(app) + 9 * HOUR_MS,
    });
    const entry = await readEntryView(app, id);
    const dashboard = holdDashboardRead(app.logic);

    const duplicateP = app.logic.duplicateEntry({ entry });

    expect(app.logic.state.runningAction).toEqual({
      kind: "duplicate",
      entryId: id,
    });
    expect(app.logic.state.pendingEntries).toMatchObject([
      {
        name: "Soup",
        time: "09:00",
        pending: "duplicating",
        date: todayKey(app),
        consumedAt: entry.consumedAt,
      },
    ]);
    expect(app.logic.state.pendingEntries[0]?.id).not.toEqual(id);

    await vi.waitFor(() => expect(dashboard.heard()).toEqual(1));
    expect(app.logic.state.pendingEntries).toHaveLength(1);

    dashboard.finishRead();
    await duplicateP;

    expect(app.logic.state.actState).toEqual("success");
    expect(app.logic.state.pendingEntries).toEqual([]);
    expect(app.logic.state.runningAction).toEqual(null);
  });

  it("should show a row for the copy on today, at the time of day on this device", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, {
      name: "Old soup",
      consumedAt: startOfToday(app) - 12 * HOUR_MS,
    });
    const entry = await readEntryView(app, id, dateAgo(app, 1));

    const copyP = app.logic.copyEntryToToday({
      entry,
      today: todayKey(app),
    });

    expect(app.logic.state.runningAction).toEqual({
      kind: "copy",
      entryId: id,
    });
    expect(app.logic.state.pendingEntries).toMatchObject([
      { name: "Old soup", pending: "copying", date: todayKey(app) },
    ]);
    await copyP;
    expect(app.logic.state.pendingEntries).toEqual([]);
  });

  it("should remove the row when the request fails", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, { name: "Soup" });
    const entry = await readEntryView(app, id);
    app.transport.goOffline();

    const duplicateP = app.logic.duplicateEntry({ entry });
    expect(app.logic.state.pendingEntries).toHaveLength(1);
    await duplicateP;

    expect(app.logic.state.actError).toEqual(NO_CONNECTION);
    expect(app.logic.state.pendingEntries).toEqual([]);
    expect(app.logic.state.runningAction).toEqual(null);
  });

  it("should show a row for a tracked saved entry, with the busy action on the saved entry", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, {
      name: "Granola",
      calories: 250,
      proteinG: 8,
      mealType: "breakfast",
    });
    const entry = await seedSavedEntry(app, id);

    const trackP = app.logic.trackSaved({ saved: entry, today: todayKey(app) });

    expect(app.logic.state.runningAction).toEqual({
      kind: "track",
      entryId: entry.id,
    });
    expect(app.logic.state.pendingEntries).toMatchObject([
      {
        name: "Granola",
        calories: 250,
        protein: 8,
        kind: "breakfast",
        pending: "copying",
        date: todayKey(app),
      },
    ]);
    await trackP;
    expect(app.logic.state.pendingEntries).toEqual([]);
  });

  it("should name the entry that a delete and a remove run on", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, { name: "Apple" });
    const entry = await readEntryView(app, id);

    const deleteP = app.logic.deleteEntry({ entry });
    expect(app.logic.state.runningAction).toEqual({
      kind: "delete",
      entryId: id,
    });
    expect(app.logic.state.pendingEntries).toEqual([]);
    await deleteP;
    expect(app.logic.state.runningAction).toEqual(null);

    const otherId = await seedEntry(app, { name: "Pear" });
    const saved = await seedSavedEntry(app, otherId);
    const removeP = app.logic.removeSaved({ saved });
    expect(app.logic.state.runningAction).toEqual({
      kind: "remove",
      entryId: saved.id,
    });
    await removeP;
    expect(app.logic.state.runningAction).toEqual(null);
  });

  it("should keep no running action after a failure", async () => {
    const app = await setupTest();
    const id = await seedEntry(app, { name: "Apple" });
    const entry = await readEntryView(app, id);
    app.transport.goOffline();

    const deleteP = app.logic.deleteEntry({ entry });
    expect(app.logic.state.runningAction).toEqual({
      kind: "delete",
      entryId: id,
    });
    await deleteP;

    expect(app.logic.state.actError).toEqual(NO_CONNECTION);
    expect(app.logic.state.runningAction).toEqual(null);
  });
});
