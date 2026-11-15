import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { dateAgo, patchSettings, today } from "./insight-test-helpers.js";
import { InsightsLogic } from "./insights-logic.js";

/** Log an entry whose fiber has an origin, as the owner's form does. */
async function seedFiber({ frontend }: Pick<FullApplication, "frontend">) {
  const response = await frontend.api.meals.$post({
    json: {
      caption: "",
      items: [
        {
          name: "Oats",
          calories: 400,
          proteinG: 20,
          fiberG: 4,
          nutrientProvenance: { fiberG: "ai" },
        },
      ],
    },
  });
  if (response.status !== 201) {
    throw new Error(`The seed entry was refused: ${response.status}`);
  }
}

/** The insights of a visitor, on a database that `seed` fills first. */
function setupTest({
  publicView = true,
  seed,
  ...params
}: LogicTestParams & {
  publicView?: boolean;
  seed?: (app: FullApplication) => Promise<void>;
} = {}) {
  return setupLogicTest(params, async (application) => {
    await patchSettings(application, { publicViewEnabled: publicView });
    await seed?.(application);
    return new InsightsLogic({
      ...application.frontend,
      audience: "public",
      entryEvents: [],
      settingsEvents: [],
      weightEvents: [],
    });
  });
}

describe("InsightsLogic public read tests", () => {
  it("should read the days in the saved timezone of the owner", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, { timezone: "Asia/Tokyo" });
        await seedFiber(application);
      },
    });

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.loaded).toEqual(true);
    expect(logic.state.today).toEqual(today(app));
    expect(logic.state.entries).toHaveLength(1);
    expect(logic.state.days.at(-1)).toMatchObject({
      date: today(app),
      mealCount: 1,
    });
    expect(logic.state.days[0]?.date).toEqual(dateAgo(app, 30));
  });

  it("should leave out where each amount came from", async () => {
    const owner = await setupLogicTest({}, async (application) => {
      await seedFiber(application);
      return new InsightsLogic({
        ...application.frontend,
        audience: "owner",
        entryEvents: [],
        settingsEvents: [],
        weightEvents: [],
      });
    });
    const { logic } = await setupTest({ seed: seedFiber });

    expect(owner.logic.state.entries[0]?.items[0]).toHaveProperty(
      "nutrientProvenance",
    );
    expect(logic.state.entries[0]?.items[0]).toMatchObject({
      name: "Oats",
      nutrients: { fiberG: 4 },
    });
    expect(logic.state.entries[0]?.items[0]).not.toHaveProperty(
      "nutrientProvenance",
    );
  });

  it("should not apply the reference limits that the owner turned on", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          vitaminB6UsFnbAdultUlEnabled: true,
          usFnbAdultUlEnabled: true,
        });
      },
    });

    expect(logic.state.referenceSettings).toEqual({
      vitaminB6UsFnbAdultUlEnabled: false,
      usFnbAdultUlEnabled: false,
    });
  });

  it("should say that the insights cannot be read while the public view is off", async () => {
    const { logic } = await setupTest({
      publicView: false,
      seed: seedFiber,
    });

    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual(
      "The public dashboard is turned off.",
    );
    expect(logic.state.loaded).toEqual(false);
    expect(logic.state.entries).toEqual([]);
  });
});
