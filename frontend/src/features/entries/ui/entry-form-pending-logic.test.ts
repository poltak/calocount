import { describe, expect, it, vi } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { NewEntryValues } from "../utils/entry-form.js";
import { EntryFormLogic } from "./entry-form-logic.js";
import { todayKey } from "./entry-test-helpers.js";

const VALUES: NewEntryValues = {
  time: "08:15",
  kind: "breakfast",
  name: "Oat porridge",
  description: "Oats with milk",
  calories: "312.5",
  protein: "12.25",
  carbs: "48.5",
  fat: "7.75",
  nutrients: {},
  origins: {},
  photo: null,
};

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new EntryFormLogic(app.frontend));
}

describe("EntryFormLogic pending row tests", () => {
  it("should show a row for the new entry until the dashboard has read again", async () => {
    const app = await setupTest();
    let heard = 0;
    let finishRead!: () => void;
    const read = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    app.logic.events.listen(async () => {
      heard += 1;
      await read;
    });

    const addP = app.logic.addEntry({ date: todayKey(app), values: VALUES });

    expect(app.logic.state.pendingEntries).toMatchObject([
      {
        name: "Oat porridge",
        description: "Oats with milk",
        time: "08:15",
        kind: "breakfast",
        calories: 312.5,
        protein: 12.25,
        pending: "creating",
        date: todayKey(app),
      },
    ]);

    await vi.waitFor(() => expect(heard).toEqual(1));
    expect(app.logic.state.pendingEntries).toHaveLength(1);

    finishRead();
    await addP;

    expect(app.logic.state.addEntryState).toEqual("success");
    expect(app.logic.state.pendingEntries).toEqual([]);
  });

  it("should remove the row when the entry cannot be sent", async () => {
    const app = await setupTest();
    app.transport.goOffline();

    const addP = app.logic.addEntry({ date: todayKey(app), values: VALUES });
    expect(app.logic.state.pendingEntries).toHaveLength(1);
    await addP;

    expect(app.logic.state.addEntryState).toEqual("error");
    expect(app.logic.state.pendingEntries).toEqual([]);
  });
});
