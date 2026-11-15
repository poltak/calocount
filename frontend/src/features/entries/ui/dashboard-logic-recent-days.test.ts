import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../types.js";
import {
  calculateLoggingStreak,
  calculateMatrixCell,
} from "../utils/dashboard-calculations.js";
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

describe("DashboardLogic recent days tests", () => {
  it("should list the last four days first, and all seven after the toggle", async () => {
    const { logic } = await setupTest();

    expect(logic.state.showAllDays).toEqual(false);

    logic.toggleAllDays();
    expect(logic.state.showAllDays).toEqual(true);

    logic.toggleAllDays();
    expect(logic.state.showAllDays).toEqual(false);
  });

  it("should count the days in a row with an entry, back from the day in view", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        for (const days of [0, 1, 3]) {
          await seedEntry(application, {
            consumedAt:
              startOfToday(application) - days * 24 * HOUR_MS + 12 * HOUR_MS,
          });
        }
      },
    });
    const { days } = logic.state;

    expect(calculateLoggingStreak({ days, endDate: dateAgo(app, 0) })).toEqual(
      2,
    );
    expect(calculateLoggingStreak({ days, endDate: dateAgo(app, 1) })).toEqual(
      1,
    );
    expect(calculateLoggingStreak({ days, endDate: dateAgo(app, 2) })).toEqual(
      0,
    );
    expect(calculateLoggingStreak({ days, endDate: dateAgo(app, 3) })).toEqual(
      1,
    );
    expect(calculateLoggingStreak({ days, endDate: "1999-01-01" })).toEqual(0);
  });
});

describe("nutrient consistency cell tests", () => {
  const known = { amount: 14, knownItemCount: 1, totalItemCount: 2 };
  const minimum = {
    value: 28,
    direction: "minimum",
    source: "default",
  } as const;
  const maximum = {
    value: 100,
    direction: "maximum",
    source: "default",
  } as const;

  it("should rate a minimum goal as low below it and met at it", () => {
    expect(calculateMatrixCell({ aggregate: known, goal: minimum })).toEqual({
      state: "low",
      progress: 50,
      intensity: 50,
      coverage: 0.5,
    });
    expect(
      calculateMatrixCell({
        aggregate: { ...known, amount: 28 },
        goal: minimum,
      }).state,
    ).toEqual("met");
  });

  it("should rate a maximum goal as met up to it and over above it", () => {
    expect(
      calculateMatrixCell({
        aggregate: { ...known, amount: 100 },
        goal: maximum,
      }).state,
    ).toEqual("met");
    expect(
      calculateMatrixCell({
        aggregate: { ...known, amount: 150 },
        goal: maximum,
      }),
    ).toMatchObject({ state: "over", progress: 150, intensity: 100 });
  });

  it("should give a day without an amount or a goal no progress", () => {
    const unknown = { amount: null, knownItemCount: 0, totalItemCount: 0 };

    expect(calculateMatrixCell({ aggregate: unknown, goal: minimum })).toEqual({
      state: "unknown",
      progress: null,
      intensity: 0,
      coverage: 0,
    });
    expect(
      calculateMatrixCell({
        aggregate: known,
        goal: { ...minimum, value: null },
      }).state,
    ).toEqual("unknown");
  });
});
