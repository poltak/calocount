import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { NewEntryValues } from "../utils/entry-form.js";
import { EntryFormLogic } from "./entry-form-logic.js";
import {
  pngFile,
  readEntryView,
  seedEntry,
  todayKey,
} from "./entry-test-helpers.js";

const VALUES: NewEntryValues = {
  time: "08:15",
  kind: "snack",
  name: "Photo snack",
  description: "",
  calories: "120",
  protein: "",
  carbs: "",
  fat: "",
  nutrients: {},
  origins: {},
  photo: null,
};

const TYPE_MESSAGE = "Select a JPEG, PNG, or WebP image.";
const SIZE_MESSAGE = "Select an image that is 10 MB or smaller.";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new EntryFormLogic(app.frontend));
}

function readMeals(app: FullApplication) {
  return app.backend.db.selectFrom("mealLogs").selectAll().execute();
}

function bytesOf(file: File) {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

/** An entry with a photo, and a started edit of it. */
async function startEditWithPhoto(app: Awaited<ReturnType<typeof setupTest>>) {
  const id = await seedEntry(app, { name: "Photo snack", photo: pngFile() });
  const entry = await readEntryView(app, id);
  app.logic.startEdit({ entry });
  const [before] = await readMeals(app);
  return { id, before };
}

describe("EntryFormLogic photo tests", () => {
  it("should log an entry with a photo and keep the photo in the bucket", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    const photo = pngFile();
    logic.openAddForm();

    const addP = logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, photo },
    });
    expect(logic.state.addEntryState).toEqual("running");
    expect(backend.photoBucket.keys()).toEqual([]);
    await addP;

    expect(logic.state.addEntryState).toEqual("success");
    expect(logic.state.addEntryError).toBeNull();
    const [meal] = await readMeals(app);
    expect(meal).toMatchObject({
      caption: "Added from dashboard",
      photoMimeType: "image/png",
      photoSizeBytes: photo.size,
    });
    // The key holds the owner, so that a key says whose photo it is.
    expect(meal?.photoKey).toMatch(
      /^meals\/default\/dashboard\/new\/[0-9a-f-]{36}$/,
    );
    expect(backend.photoBucket.keys()).toEqual([meal?.photoKey]);
    expect(backend.photoBucket.read(meal?.photoKey ?? "")).toEqual({
      bytes: await bytesOf(photo),
      contentType: "image/png",
    });
  });

  it("should log an entry with no photo and leave the bucket empty", async () => {
    const app = await setupTest();

    await app.logic.addEntry({ date: todayKey(app), values: VALUES });

    expect(app.logic.state.addEntryState).toEqual("success");
    expect(await readMeals(app)).toMatchObject([
      { photoKey: null, photoMimeType: null, photoSizeBytes: null },
    ]);
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should refuse a file of the wrong type before it sends anything", async () => {
    const app = await setupTest();
    const gif = new File([await bytesOf(pngFile())], "snack.gif", {
      type: "image/gif",
    });

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, photo: gif },
    });

    expect(app.logic.state.addEntryState).toEqual("error");
    expect(app.logic.state.addEntryError).toEqual(TYPE_MESSAGE);
    expect(await readMeals(app)).toEqual([]);
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should refuse a file over 10 MB before it sends anything, and save after a valid file", async () => {
    const app = await setupTest();
    const huge = new File([Buffer.alloc(10 * 1024 * 1024 + 1)], "huge.png", {
      type: "image/png",
    });

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, photo: huge },
    });

    expect(app.logic.state.addEntryError).toEqual(SIZE_MESSAGE);
    expect(await readMeals(app)).toEqual([]);

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, photo: pngFile() },
    });

    expect(app.logic.state.addEntryState).toEqual("success");
    expect(app.logic.state.addEntryError).toBeNull();
    expect(await readMeals(app)).toHaveLength(1);
  });

  it("should refuse a file whose content is not the image type it claims", async () => {
    const app = await setupTest();
    const fake = new File([new Uint8Array([1, 2, 3, 4])], "snack.png", {
      type: "image/png",
    });

    await app.logic.addEntry({
      date: todayKey(app),
      values: { ...VALUES, photo: fake },
    });

    expect(app.logic.state.addEntryState).toEqual("error");
    expect(app.logic.state.addEntryError).toEqual(
      "The photo content does not match its image type.",
    );
    expect(await readMeals(app)).toEqual([]);
    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should replace the photo of an entry and remove the old object", async () => {
    const app = await setupTest();
    const { id, before } = await startEditWithPhoto(app);
    const replacement = pngFile("second.png");

    expect(app.logic.changeDraftPhoto({ photo: replacement })).toBeNull();
    expect(app.logic.state.draft?.photo).toBe(replacement);
    const saveP = app.logic.saveEdit();
    expect(app.logic.state.saveEntryState).toEqual("running");
    await saveP;

    expect(app.logic.state.saveEntryState).toEqual("success");
    expect(app.logic.state.draft).toBeNull();
    const [after] = await readMeals(app);
    expect(after?.id).toEqual(id);
    expect(after?.photoKey).not.toEqual(before?.photoKey);
    expect(after?.photoKey).toMatch(
      new RegExp(`^meals/default/dashboard/${id}/`),
    );
    expect(app.backend.photoBucket.keys()).toEqual([after?.photoKey]);
  });

  it("should keep the old photo object while a copy of the entry uses it", async () => {
    const app = await setupTest();
    const { id, before } = await startEditWithPhoto(app);
    const copy = await app.frontend.api.meals[":id"].copy.$post({
      param: { id },
      json: {},
    });
    expect(copy.status).toEqual(201);

    app.logic.changeDraftPhoto({ photo: pngFile("second.png") });
    await app.logic.saveEdit();

    const keys = (await readMeals(app)).map((meal) => meal.photoKey);
    expect(keys).toHaveLength(2);
    expect(keys).toContain(before?.photoKey);
    expect(app.backend.photoBucket.keys()).toEqual(keys.toSorted());
  });

  it("should refuse a replacement of the wrong type and keep the draft without it", async () => {
    const app = await setupTest();
    const { before } = await startEditWithPhoto(app);
    const gif = new File([await bytesOf(pngFile())], "snack.gif", {
      type: "image/gif",
    });

    expect(app.logic.changeDraftPhoto({ photo: gif })).toEqual(TYPE_MESSAGE);

    expect(app.logic.state.draft?.photo).toBeNull();
    expect(app.logic.state.saveEntryError).toEqual(TYPE_MESSAGE);
    expect(await readMeals(app)).toMatchObject([
      { photoKey: before?.photoKey },
    ]);

    expect(app.logic.changeDraftPhoto({ photo: pngFile() })).toBeNull();
    expect(app.logic.state.saveEntryError).toBeNull();
  });

  it("should save an edit with no new photo and keep the photo it has", async () => {
    const app = await setupTest();
    const { before } = await startEditWithPhoto(app);
    app.logic.changeDraft({ field: "description", value: "Much better" });

    await app.logic.saveEdit();

    expect(app.logic.state.saveEntryState).toEqual("success");
    expect(await readMeals(app)).toMatchObject([
      { caption: "Much better", photoKey: before?.photoKey },
    ]);
    expect(app.backend.photoBucket.keys()).toEqual([before?.photoKey]);
  });
});
