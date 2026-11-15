import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../types.js";
import { DashboardLogic } from "./dashboard-logic.js";
import type { Seed } from "./dashboard-test-setup.js";
import {
  HOUR_MS,
  dateAgo,
  seedEntry,
  startOfToday,
} from "./entry-test-helpers.js";

function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  const events = new EventEmitter<EntryEvent>();
  return setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new DashboardLogic({
      ...application.frontend,
      audience: "owner",
      entryEvents: [events],
      settingsEvents: [],
      weightEvents: [],
    });
  });
}

describe("DashboardLogic inspect entry tests", () => {
  it("should open the day of the entry and return the entry", async () => {
    let entryId = "";
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        entryId = await seedEntry(application, {
          name: "Old lunch",
          consumedAt:
            startOfToday(application) - 3 * 24 * HOUR_MS + 12 * HOUR_MS,
        });
      },
    });
    const date = dateAgo(app, 3);

    const entry = await logic.inspectEntry({ entryId, date });

    expect(logic.state.selectedDate).toEqual(date);
    expect(entry).toMatchObject({ id: entryId, name: "Old lunch" });
    expect(logic.state.inspectedEntryId).toEqual(entryId);

    logic.finishInspect();
    expect(logic.state.inspectedEntryId).toEqual(null);
  });

  it("should tell the owner when the entry is not on that day", async () => {
    const { logic, ...app } = await setupTest();

    const entry = await logic.inspectEntry({
      entryId: "missing",
      date: dateAgo(app, 2),
    });

    expect(entry).toEqual(null);
    expect(logic.state.inspectedEntryId).toEqual(null);
    expect(logic.state.statusMessage).toEqual(
      "The historical entry could not be loaded.",
    );
  });
});
