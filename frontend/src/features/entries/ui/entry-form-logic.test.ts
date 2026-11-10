import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../types.js";
import type { NewEntryValues } from "../utils/entry-form.js";
import { EntryFormLogic } from "./entry-form-logic.js";
import { readEntryView, seedEntry, todayKey } from "./entry-test-helpers.js";

const NO_CONNECTION =
  "No connection. Check your internet connection and try again.";

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

/** Every event that the Logic sends from now on, in order. */
function hearEvents(logic: EntryFormLogic): EntryEvent[] {
  const heard: EntryEvent[] = [];
  logic.events.listen((event) => {
    heard.push(event);
  });
  return heard;
}

function minute(timestamp: number) {
  return new Date(timestamp).toISOString().slice(11, 16);
}

function readMeals(app: FullApplication) {
  return app.backend.db.selectFrom("mealLogs").selectAll().execute();
}

function readItems(app: FullApplication) {
  return app.backend.db
    .selectFrom("mealItems")
    .selectAll()
    .orderBy("createdAt", "desc")
    .orderBy("name")
    .execute();
}

describe("EntryFormLogic add tests", () => {
  it("should start the form at the time of day on this device, with the type that fits it", async () => {
    const { frontend, logic } = await setupTest();
    const before = minute(frontend.services.clock.now());

    logic.openAddForm();

    const after = minute(frontend.services.clock.now());
    expect(logic.state.addFormOpen).toEqual(true);
    expect([before, after]).toContain(logic.state.formTime);
    const hour = Number(logic.state.formTime.slice(0, 2));
    const expectedKind =
      hour >= 4 && hour < 11
        ? "breakfast"
        : hour >= 11 && hour < 15
          ? "lunch"
          : hour >= 17 && hour < 22
            ? "dinner"
            : "snack";
    expect(logic.state.formKind).toEqual(expectedKind);

    logic.closeAddForm();
    expect(logic.state.addFormOpen).toEqual(false);
  });

  it("should log an entry at the time of the form on the day in view", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    const date = todayKey(app);
    const heard = hearEvents(logic);
    logic.openAddForm();

    const addP = logic.addEntry({ date, values: VALUES });
    expect(logic.state.addEntryState).toEqual("running");
    expect(logic.busy).toEqual(true);
    await addP;

    expect(logic.state.addEntryState).toEqual("success");
    expect(logic.busy).toEqual(false);
    expect(logic.state.addFormOpen).toEqual(false);
    expect(heard).toEqual([
      { type: "entriesChanged", message: "Entry added." },
    ]);
    expect(await readMeals(app)).toMatchObject([
      {
        ownerKey: backend.config.ownerKey,
        consumedAt: Date.parse(`${date}T08:15:00Z`),
        source: "dashboard",
        caption: "Oats with milk",
        mealType: "breakfast",
        status: "complete",
        totalCalories: 312.5,
        totalProteinG: 12.25,
        totalCarbsG: 48.5,
        totalFatG: 7.75,
      },
    ]);
    expect(await readItems(app)).toMatchObject([
      {
        name: "Oat porridge",
        quantity: 1,
        unit: "serving",
        source: "dashboard",
      },
    ]);
  });

  it("should name an entry and describe it when the owner types neither", async () => {
    const app = await setupTest();

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, name: " ", description: "", kind: "other" },
    });

    expect(await readMeals(app)).toMatchObject([
      { caption: "Added from dashboard", mealType: null },
    ]);
    expect(await readItems(app)).toMatchObject([{ name: "New entry" }]);
  });

  it("should keep a blank nutrient unknown and a zero nutrient at zero, with the origin of known values only", async () => {
    const app = await setupTest();

    await app.logic.addEntry({
      date: todayKey(app),
      values: {
        ...VALUES,
        nutrients: { fiberG: "6.5", sodiumMg: "0", calciumMg: "" },
        origins: { fiberG: "manual", sodiumMg: "label", calciumMg: "manual" },
      },
    });

    const [item] = await readItems(app);
    expect(item).toMatchObject({
      fiberG: 6.5,
      sodiumMg: 0,
      calciumMg: null,
      vitaminAMcgRae: null,
    });
    expect(JSON.parse(item?.nutrientProvenanceJson ?? "null")).toEqual({
      fiberG: "manual",
      sodiumMg: "label",
    });
  });

  it("should store every tracked nutrient under its own column", async () => {
    const app = await setupTest();
    const nutrients = Object.fromEntries(
      [
        "vitaminAMcgRae",
        "vitaminCMg",
        "vitaminDMcg",
        "vitaminEMg",
        "vitaminKMcg",
        "vitaminB6Mg",
        "folateMcgDfe",
        "vitaminB12Mcg",
      ].map((key, index) => [key, String(index + 1)]),
    );

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, nutrients },
    });

    expect(await readItems(app)).toMatchObject([
      {
        vitaminAMcgRae: 1,
        vitaminCMg: 2,
        vitaminDMcg: 3,
        vitaminEMg: 4,
        vitaminKMcg: 5,
        vitaminB6Mg: 6,
        folateMcgDfe: 7,
        vitaminB12Mcg: 8,
      },
    ]);
  });

  it("should refuse a time that does not exist", async () => {
    const app = await setupTest();

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, time: "25:00" },
    });

    expect(app.logic.state.addEntryState).toEqual("error");
    expect(app.logic.state.addEntryError).toEqual("Enter a valid entry time.");
    expect(await readMeals(app)).toEqual([]);
  });

  it("should refuse a time that a change to summer time skips", async () => {
    const app = await setupTest();
    app.frontend.services.clock.useTimeZone("Europe/Berlin");

    // 02:30 on 29 March 2026 does not exist in Berlin.
    await app.logic.addEntry({
      date: "2026-03-29",
      values: { ...VALUES, time: "02:30" },
    });

    expect(app.logic.state.addEntryError).toEqual("Enter a valid entry time.");
  });

  it("should show the message of the backend for a value that it refuses", async () => {
    const app = await setupTest();

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, name: "x".repeat(201) },
    });

    expect(app.logic.state.addEntryState).toEqual("error");
    expect(app.logic.state.addEntryError).toEqual(
      "Use 200 characters or fewer",
    );
    expect(app.logic.state.addFormOpen).toEqual(false);
    expect(await readMeals(app)).toEqual([]);
  });

  it("should keep the form open when the entry cannot be sent", async () => {
    const app = await setupTest();
    app.logic.openAddForm();
    app.transport.goOffline();

    await app.logic.addEntry({ date: todayKey(app), values: VALUES });

    expect(app.logic.state.addEntryError).toEqual(NO_CONNECTION);
    expect(app.logic.state.addFormOpen).toEqual(true);
  });
});

async function setupEditTest(
  entry: Parameters<typeof seedEntry>[1] = {
    name: "Audit lunch",
    calories: 500,
    proteinG: 30,
    caption: "Lunch at work",
    mealType: "lunch",
  },
) {
  const app = await setupTest();
  const id = await seedEntry(app, entry);
  const view = await readEntryView(app, id);
  return { ...app, id, view };
}

describe("EntryFormLogic edit tests", () => {
  it("should start an edit with the values of the entry as text, and drop it on cancel", async () => {
    const { logic, view } = await setupEditTest();

    logic.startEdit({ entry: view });

    expect(logic.state.draft).toMatchObject({
      name: "Audit lunch",
      description: "Lunch at work",
      kind: "lunch",
      totals: { calories: "500", protein: "30", carbs: "0", fat: "0" },
    });

    logic.cancelEdit();
    expect(logic.state.draft).toEqual(null);
  });

  it("should change the totals, the name, the description and the type of the entry", async () => {
    const app = await setupEditTest();
    const { id, logic, view } = app;
    const heard = hearEvents(logic);
    logic.startEdit({ entry: view });
    logic.changeDraft({ field: "name", value: "Team lunch" });
    logic.changeDraft({ field: "description", value: "Lunch at the audit" });
    logic.changeDraft({ field: "kind", value: "dinner" });
    logic.changeDraft({ field: "calories", value: "650" });
    logic.changeDraft({ field: "protein", value: "41" });
    logic.changeDraft({ field: "carbs", value: "60" });
    logic.changeDraft({ field: "fat", value: "25" });

    const saveP = logic.saveEdit();
    expect(logic.state.saveEntryState).toEqual("running");
    expect(logic.busy).toEqual(true);
    await saveP;

    expect(logic.state.saveEntryState).toEqual("success");
    expect(logic.state.draft).toEqual(null);
    expect(heard).toEqual([
      { type: "entriesChanged", message: "Entry saved." },
    ]);
    expect(await readMeals(app)).toMatchObject([
      {
        id,
        caption: "Lunch at the audit",
        mealType: "dinner",
        totalCalories: 650,
        totalProteinG: 41,
        totalCarbsG: 60,
        totalFatG: 25,
      },
    ]);
    expect(await readItems(app)).toMatchObject([
      { name: "Team lunch", calories: 650, proteinG: 41, carbsG: 60, fatG: 25 },
    ]);
  });

  it("should record the edit with the entry before and after it", async () => {
    const app = await setupEditTest();
    app.logic.startEdit({ entry: app.view });
    app.logic.changeDraft({ field: "calories", value: "650" });

    await app.logic.saveEdit();

    const revisions = await app.backend.db
      .selectFrom("mealRevisions")
      .selectAll()
      .execute();
    expect(revisions).toMatchObject([
      { mealId: app.id, source: "dashboard", reason: "edit" },
    ]);
    expect(
      JSON.parse(revisions[0]?.beforeJson ?? "{}").meal.totalCalories,
    ).toEqual(500);
    expect(
      JSON.parse(revisions[0]?.afterJson ?? "{}").meal.totalCalories,
    ).toEqual(650);
  });

  it("should store no type for an entry that the owner sets to no type", async () => {
    const app = await setupEditTest();
    app.logic.startEdit({ entry: app.view });
    app.logic.changeDraft({ field: "kind", value: "" });

    await app.logic.saveEdit();

    expect(await readMeals(app)).toMatchObject([{ mealType: null }]);
  });

  it("should let the owner empty a total, which then counts as zero", async () => {
    const app = await setupEditTest();
    app.logic.startEdit({ entry: app.view });

    app.logic.changeDraft({ field: "calories", value: "" });
    expect(app.logic.state.draft?.totals.calories).toEqual("");
    await app.logic.saveEdit();

    expect(await readMeals(app)).toMatchObject([{ totalCalories: 0 }]);
  });

  it("should keep the other values of the entry when only one changes", async () => {
    const app = await setupEditTest({
      caption: "Lunch at work",
      mealType: "lunch",
      items: [
        {
          name: "Soup",
          calories: 200,
          proteinG: 8,
          carbsG: 20,
          fatG: 5,
          fiberG: 3,
          folicAcidMcg: 40,
        },
      ],
    });
    app.logic.startEdit({ entry: app.view });
    app.logic.changeDraft({ field: "protein", value: "9" });

    await app.logic.saveEdit();

    expect(await readMeals(app)).toMatchObject([
      {
        caption: "Lunch at work",
        mealType: "lunch",
        totalCalories: 200,
        totalProteinG: 9,
      },
    ]);
    expect(await readItems(app)).toMatchObject([
      { name: "Soup", fiberG: 3, folicAcidMcg: 40, carbsG: 20 },
    ]);
  });

  it("should put a change of a total into the first item, so the items still add up", async () => {
    const app = await setupEditTest({
      items: [
        { name: "Rice", calories: 300 },
        { name: "Beans", calories: 200 },
      ],
    });
    app.logic.startEdit({ entry: app.view });
    app.logic.changeDraft({ field: "calories", value: "600" });

    await app.logic.saveEdit();

    expect(await readItems(app)).toMatchObject([
      { name: "Beans", calories: 200 },
      { name: "Rice", calories: 400 },
    ]);
    expect(await readMeals(app)).toMatchObject([{ totalCalories: 600 }]);
  });

  it("should shrink the other items when a lower total does not fit in the first", async () => {
    const app = await setupEditTest({
      items: [
        { name: "Rice", calories: 300 },
        { name: "Beans", calories: 200 },
        { name: "Corn", calories: 200 },
      ],
    });
    app.logic.startEdit({ entry: app.view });
    app.logic.changeDraft({ field: "calories", value: "200" });

    await app.logic.saveEdit();

    expect(await readItems(app)).toMatchObject([
      { name: "Beans", calories: 100 },
      { name: "Corn", calories: 100 },
      { name: "Rice", calories: 0 },
    ]);
  });

  it("should replace a hundred items in one edit", async () => {
    const app = await setupEditTest({
      items: Array.from({ length: 100 }, (_, index) => ({
        name: `Item ${index}`,
        calories: 1,
      })),
    });
    app.logic.startEdit({ entry: app.view });
    app.logic.changeDraft({ field: "calories", value: "150" });

    await app.logic.saveEdit();

    expect(await readMeals(app)).toMatchObject([{ totalCalories: 150 }]);
    expect(await readItems(app)).toHaveLength(100);
  });

  it("should change a nutrient of an item, and mark the typed value as entered by hand", async () => {
    const app = await setupEditTest();
    app.logic.startEdit({ entry: app.view });

    app.logic.changeDraftNutrient({ itemIndex: 0, key: "fiberG", value: "4" });
    expect(app.logic.state.draft?.items[0]?.origins.fiberG).toEqual("manual");
    app.logic.changeDraftOrigin({
      itemIndex: 0,
      key: "fiberG",
      origin: "label",
    });
    app.logic.changeDraftNutrient({ itemIndex: 0, key: "sodiumMg", value: "" });
    app.logic.changeDraftOrigin({
      itemIndex: 0,
      key: "sodiumMg",
      origin: "ai",
    });
    expect(app.logic.state.draft?.items[0]?.origins.sodiumMg).toEqual("");
    await app.logic.saveEdit();

    const [item] = await readItems(app);
    expect(item).toMatchObject({ fiberG: 4, sodiumMg: null });
    expect(JSON.parse(item?.nutrientProvenanceJson ?? "null")).toEqual({
      fiberG: "label",
    });
  });

  it("should ignore a change when no edit is open, or an item that does not exist", async () => {
    const { logic, view } = await setupEditTest();

    logic.changeDraft({ field: "name", value: "Nothing" });
    logic.changeDraftNutrient({ itemIndex: 0, key: "fiberG", value: "4" });
    expect(logic.state.draft).toEqual(null);

    logic.startEdit({ entry: view });
    logic.changeDraftNutrient({ itemIndex: 5, key: "fiberG", value: "4" });
    logic.changeDraftOrigin({ itemIndex: 5, key: "fiberG", origin: "ai" });
    expect(logic.state.draft?.items).toHaveLength(1);
  });

  it("should save nothing when no edit is open", async () => {
    const { logic } = await setupEditTest();
    const heard = hearEvents(logic);

    await logic.saveEdit();

    expect(logic.state.saveEntryState).toEqual("success");
    expect(heard).toEqual([]);
  });

  it("should keep the edit open and say so when the entry is gone", async () => {
    const app = await setupEditTest();
    app.logic.startEdit({ entry: app.view });
    await app.backend.db.deleteFrom("mealItems").execute();
    await app.backend.db.deleteFrom("mealLogs").execute();

    await app.logic.saveEdit();

    expect(app.logic.state.saveEntryState).toEqual("error");
    expect(app.logic.state.saveEntryError).toEqual("Entry not found.");
    expect(app.logic.state.draft).not.toEqual(null);
  });
});
