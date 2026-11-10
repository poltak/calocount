import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
} from "../../core/tests/full-application.js";
import type { NewEntryValues } from "../utils/entry-form.js";
import { EntryFormLogic } from "./entry-form-logic.js";
import { readEntryView, todayKey } from "./entry-test-helpers.js";

const VALUES: NewEntryValues = {
  time: "08:15",
  kind: "breakfast",
  name: "Label granola",
  description: "",
  calories: "260",
  protein: "5",
  carbs: "40",
  fat: "8",
  nutrients: {},
  origins: {},
  photo: null,
};

function setupTest() {
  return setupLogicTest({}, (app) => new EntryFormLogic(app.frontend));
}

async function readFirstItem(app: FullApplication) {
  const [meal] = await app.backend.db
    .selectFrom("mealLogs")
    .select("id")
    .execute();
  const view = await readEntryView(app, meal?.id ?? "");
  return view.items[0];
}

describe("EntryFormLogic nutrient origin tests", () => {
  it("should give the dashboard the origin of each known value, and none for a blank value", async () => {
    const app = await setupTest();

    await app.logic.addEntry({
      date: todayKey(app),
      values: {
        ...VALUES,
        nutrients: { fiberG: "5", sodiumMg: "120", calciumMg: "" },
        origins: { fiberG: "label", sodiumMg: "database", calciumMg: "ai" },
      },
    });

    const item = await readFirstItem(app);
    expect(item?.nutrientProvenance).toEqual({
      fiberG: "label",
      sodiumMg: "database",
    });
    expect(item?.nutrients.calciumMg).toBeNull();
  });

  it("should leave the origin out when a known value has none", async () => {
    const app = await setupTest();

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, nutrients: { fiberG: "7" }, origins: {} },
    });

    const item = await readFirstItem(app);
    expect(item?.nutrients.fiberG).toBe(7);
    expect(item?.nutrientProvenance).toEqual({});
  });
});
