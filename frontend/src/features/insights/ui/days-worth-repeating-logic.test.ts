import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import {
  axisPosition,
  buildRepeatPoints,
  repeatAxisScale,
} from "@app/common/features/entries/utils/insights/days-worth-repeating";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../../entries/types.js";
import {
  dateAgo,
  patchSettings,
  saveWeight,
  seedDay,
  today,
  type SeedItem,
} from "./insight-test-helpers.js";
import { InsightsLogic } from "./insights-logic.js";

type Seed = (app: FullApplication) => Promise<void>;

async function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  const events = new EventEmitter<EntryEvent>();
  const app = await setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new InsightsLogic({
      ...application.frontend,
      entryEvents: [events],
      settingsEvents: [],
      weightEvents: [],
    });
  });
  return { ...app, events };
}

/** The points of the panel, with the choices that the logic holds and the targets of the owner. */
function pointsOf(
  logic: InsightsLogic,
  overrides: Partial<Parameters<typeof buildRepeatPoints>[0]> = {},
) {
  const { days, today: currentDate, ...state } = logic.state;
  return buildRepeatPoints({
    days,
    currentDate: currentDate ?? "",
    range: 30,
    calorieTarget: state.calorieTarget,
    proteinGoals: state.proteinTargets,
    fallbackProteinTarget: null,
    nutrientGoals: state.nutrientGoals,
    metric: "protein",
    calorieBand: [90, 110],
    ...overrides,
  });
}

/** One day of a single item. The default targets are 2400 kcal, 160 g protein and 28 g fiber. */
function day(date: string, item: Partial<SeedItem> = {}) {
  return {
    date,
    items: [{ name: "Meal", calories: 2400, proteinG: 160, ...item }],
  };
}

describe("InsightsLogic days worth repeating tests", () => {
  it("should list finished logged days and apply the calorie band inclusively", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedDay(application, day(today(application)));
        await seedDay(
          application,
          day(dateAgo(application, 1), { calories: 2160 }),
        );
        await seedDay(application, day(dateAgo(application, 3)));
      },
    });

    const points = pointsOf(logic);

    expect(points.map((point) => point.date)).toEqual([
      dateAgo(app, 3),
      dateAgo(app, 1),
    ]);
    expect(points[1]).toMatchObject({
      caloriePercent: 90,
      inCalorieBand: true,
    });
  });

  it("should take the range from calendar days that end yesterday", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        for (const ago of [10, 7, 3]) {
          await seedDay(application, day(dateAgo(application, ago)));
        }
      },
    });

    expect(pointsOf(logic, { range: 7 }).map((point) => point.date)).toEqual([
      dateAgo(app, 7),
      dateAgo(app, 3),
    ]);
  });

  it("should not use a fixed target for a date that has no protein goal", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          proteinGoalMode: "gramsPerKg",
          dailyProteinTargetPerKg: 2,
        });
        await saveWeight(application, dateAgo(application, 2), 60);
        await seedDay(application, day(dateAgo(application, 3)));
        await seedDay(application, day(dateAgo(application, 1)));
      },
    });

    const [early, later] = pointsOf(logic, { fallbackProteinTarget: 100 });

    expect(early?.date).toEqual(dateAgo(app, 3));
    expect(early).toMatchObject({ target: null, percent: null });
    expect(later).toMatchObject({ target: 120, percent: (160 / 120) * 100 });
  });

  it("should keep complete, partial and unknown fiber coverage", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(
          application,
          day(dateAgo(application, 3), { fiberG: 30 }),
        );
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [
            { name: "Bread", calories: 1200, fiberG: 20 },
            { name: "Soup", calories: 1200 },
          ],
        });
        await seedDay(application, day(dateAgo(application, 1)));
      },
    });

    const points = pointsOf(logic, { metric: "fiber" });

    expect(points.map((point) => [point.coverage, point.targetMet])).toEqual([
      ["complete", true],
      ["partial", false],
      ["unknown", null],
    ]);
  });

  it("should meet both targets only inside the calorie band and above the vertical target", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, day(dateAgo(application, 3)));
        await seedDay(
          application,
          day(dateAgo(application, 2), { proteinG: 100 }),
        );
        await seedDay(
          application,
          day(dateAgo(application, 1), { calories: 3000 }),
        );
      },
    });

    expect(
      pointsOf(logic).map((point) => [
        point.inCalorieBand,
        point.targetMet,
        point.meetsBothTargets,
      ]),
    ).toEqual([
      [true, true, true],
      [true, false, false],
      [false, true, false],
    ]);
  });

  it("should scale an axis to contain an outlier and keep the 100% reference", () => {
    const scale = repeatAxisScale([80, 100, 241]);

    expect(scale).toEqual({ max: 250, ticks: [0, 100, 250] });
    expect(axisPosition(100, scale)).toEqual(40);
  });
});
