import { describe, expect, it } from "vitest";
import { NoteEditLogic } from "./note-edit-logic.js";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
  type TestDatabase,
} from "../../core/tests/full-application.js";

const SAVED = { title: "Saved title", body: "Saved body" };
const CHANGED = { title: "Changed title", body: "Changed body" };

async function seedNote({ frontend }: FullApplication): Promise<string> {
  const response = await frontend.api.notes.$post({ json: SAVED });
  if (response.status !== 201) {
    throw new Error("Seeding a note failed");
  }
  const { note } = await response.json();
  return note.id;
}

/**
 * The Logic opens one note, so `seed` first makes the note in the same
 * application and returns its ID. By default the signed-in user creates it.
 */
async function setupTest({
  seed = seedNote,
  ...params
}: LogicTestParams & {
  seed?: (app: FullApplication) => Promise<string>;
} = {}) {
  let noteId = "";
  const test = await setupLogicTest(params, async (app) => {
    noteId = await seed(app);
    return new NoteEditLogic({
      ...app.frontend,
      userId: app.owner.id,
      authEvents: app.auth.events,
      noteId,
    });
  });
  return {
    ...test,
    noteId,
    draftKey: `notes.draft.${test.owner.id}.${noteId}`,
  };
}

function readNotes(db: TestDatabase) {
  return db
    .selectFrom("note")
    .select(["id", "title", "body"])
    .orderBy("createdAt")
    .execute();
}

function readNoteTimes(db: TestDatabase, id: string) {
  return db
    .selectFrom("note")
    .select(["createdAt", "updatedAt"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}

async function readActions(db: TestDatabase) {
  const rows = await db
    .selectFrom("activity")
    .select("action")
    .orderBy("createdAt")
    .execute();
  return rows.map((row) => row.action);
}

describe("NoteEditLogic tests", () => {
  it("should load the note into the form", async () => {
    const { logic } = await setupTest({ skipInitialization: true });
    const { draft } = logic.plugins;

    expect(logic.state.loadState).toEqual("pristine");
    expect(logic.state.loadError).toEqual(null);
    expect(draft.state).toEqual({ title: "", body: "", isRestored: false });

    await logic.initialize();

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.loadError).toEqual(null);
    expect(draft.state).toEqual({ ...SAVED, isRestored: false });

    // A later load shows the running state at once.
    const loadP = logic.load();
    expect(logic.state.loadState).toEqual("running");
    await loadP;
    expect(logic.state.loadState).toEqual("success");
  });

  it("should keep the user's unsaved changes in the form, not the saved note", async () => {
    const { frontend, logic, draftKey } = await setupTest({
      skipInitialization: true,
    });
    frontend.browserStorage.setItem(draftKey, JSON.stringify(CHANGED));

    await logic.initialize();

    expect(logic.state.loadState).toEqual("success");
    expect(logic.plugins.draft.state).toEqual({
      ...CHANGED,
      isRestored: true,
    });
  });

  it("should set the error state when the note does not exist", async () => {
    const { logic } = await setupTest({
      seed: async () => "00000000-0000-4000-8000-000000000000",
    });

    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual("This note does not exist");
    expect(logic.plugins.draft.state).toMatchObject({ title: "", body: "" });
  });

  it("should reach the note route when the ID has reserved characters", async () => {
    const { logic } = await setupTest({
      seed: async () => "note/part?tag=#%",
    });

    // The route refuses the ID because it is not a UUID. An ID that was not
    // encoded would miss the route, and the message would be "Route not found".
    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual("The request is invalid");
    expect(logic.plugins.draft.state).toMatchObject({ title: "", body: "" });
  });

  it("should not open a note that belongs to another user", async () => {
    const { logic } = await setupTest({
      // No route lets a second user sign in, so the trusted setup operation
      // and a direct row create this condition.
      seed: async ({ backend }) => {
        const other = await backend.services.auth.createAccount({
          email: "other@example.test",
          name: "Other",
          password: "another-test-password",
        });
        const foreign = await backend.db
          .insertInto("note")
          .values({ userId: other.id, title: "Private", body: "Not yours" })
          .returning("id")
          .executeTakeFirstOrThrow();
        return foreign.id;
      },
    });

    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual("This note does not exist");
    expect(logic.plugins.draft.state).toMatchObject({ title: "", body: "" });
  });

  it("should afford saving the changes, and forget the draft", async () => {
    const { backend, frontend, logic, noteId, draftKey, transport } =
      await setupTest();
    const { draft } = logic.plugins;
    draft.setTitle(CHANGED.title);
    draft.setBody(CHANGED.body);

    expect(logic.state.saveState).toEqual("pristine");
    expect(logic.state.saveError).toEqual(null);
    expect(logic.state.saveFieldErrors).toEqual(null);
    expect(logic.state.isDone).toEqual(false);
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(
      JSON.stringify(CHANGED),
    );
    expect(await readNotes(backend.db)).toEqual([{ id: noteId, ...SAVED }]);
    const timesBefore = await readNoteTimes(backend.db, noteId);
    expect(timesBefore.updatedAt).toEqual(timesBefore.createdAt);

    const held = transport.holdNextRequest();
    const saveP = logic.save();
    await held.reached;
    expect(logic.state.saveState).toEqual("running");
    expect(logic.state.isDone).toEqual(false);
    expect(await readNotes(backend.db)).toEqual([{ id: noteId, ...SAVED }]);
    held.release();
    await saveP;

    expect(logic.state.saveState).toEqual("success");
    expect(logic.state.saveError).toEqual(null);
    expect(logic.state.isDone).toEqual(true);
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(null);
    expect(await readNotes(backend.db)).toEqual([{ id: noteId, ...CHANGED }]);
    // The database sets the time of the change. No code sets it.
    const timesAfter = await readNoteTimes(backend.db, noteId);
    expect(timesAfter.createdAt).toEqual(timesBefore.createdAt);
    expect(timesAfter.updatedAt.getTime()).toBeGreaterThan(
      timesBefore.updatedAt.getTime(),
    );
    expect(await readActions(backend.db)).toEqual([
      "note.created",
      "note.updated",
    ]);
  });

  it("should keep the time of the last change when a save changes nothing", async () => {
    const { backend, logic, noteId } = await setupTest();
    const timesBefore = await readNoteTimes(backend.db, noteId);

    expect(logic.state.saveState).toEqual("pristine");
    expect(logic.plugins.draft.state).toMatchObject(SAVED);

    const saveP = logic.save();
    expect(logic.state.saveState).toEqual("running");
    await saveP;

    expect(logic.state.saveState).toEqual("success");
    expect(logic.state.isDone).toEqual(true);
    expect(await readNotes(backend.db)).toEqual([{ id: noteId, ...SAVED }]);
    expect(await readNoteTimes(backend.db, noteId)).toEqual(timesBefore);
  });

  it("should set a message at the title and keep the draft when the title is too long", async () => {
    const { backend, frontend, logic, noteId, draftKey } = await setupTest();
    const longTitle = "x".repeat(201);
    logic.plugins.draft.setTitle(longTitle);

    expect(logic.state.saveState).toEqual("pristine");

    const saveP = logic.save();
    expect(logic.state.saveState).toEqual("running");
    await saveP;

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual("The request is invalid");
    // This rule has no message of its own, so the message for its kind applies.
    expect(logic.state.saveFieldErrors).toEqual({
      title: "Use 200 characters or fewer",
    });
    expect(logic.state.isDone).toEqual(false);
    expect(logic.plugins.draft.state.title).toEqual(longTitle);
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(
      JSON.stringify({ title: longTitle, body: SAVED.body }),
    );
    expect(await readNotes(backend.db)).toEqual([{ id: noteId, ...SAVED }]);
  });

  it("should set the error state when the note was deleted in the meantime", async () => {
    const { backend, logic } = await setupTest();
    logic.plugins.draft.setTitle(CHANGED.title);
    await backend.db.deleteFrom("note").execute();

    expect(logic.state.saveState).toEqual("pristine");

    const saveP = logic.save();
    expect(logic.state.saveState).toEqual("running");
    await saveP;

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual("This note does not exist");
    expect(logic.state.isDone).toEqual(false);
    expect(await readNotes(backend.db)).toEqual([]);
    expect(await readActions(backend.db)).toEqual(["note.created"]);
  });

  it("should set the error state and keep the draft when the connection fails", async () => {
    const { backend, frontend, logic, noteId, draftKey, transport } =
      await setupTest();
    logic.plugins.draft.setTitle(CHANGED.title);
    transport.goOffline();

    expect(logic.state.saveState).toEqual("pristine");

    const saveP = logic.save();
    expect(logic.state.saveState).toEqual("running");
    await saveP;

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual("Failed to fetch");
    expect(logic.state.isDone).toEqual(false);
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(
      JSON.stringify({ title: CHANGED.title, body: SAVED.body }),
    );
    expect(await readNotes(backend.db)).toEqual([{ id: noteId, ...SAVED }]);
  });

  it("should give up the unsaved changes on cancel", async () => {
    const { backend, frontend, logic, noteId, draftKey } = await setupTest();
    logic.plugins.draft.setTitle(CHANGED.title);

    expect(logic.state.isDone).toEqual(false);
    expect(frontend.browserStorage.getItem(draftKey)).not.toEqual(null);

    logic.cancel();

    expect(logic.state.isDone).toEqual(true);
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(null);
    expect(await readNotes(backend.db)).toEqual([{ id: noteId, ...SAVED }]);
  });
});
