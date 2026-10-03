import { describe, expect, it } from "vitest";
import { NotesLogic } from "./notes-logic.js";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
  type TestDatabase,
} from "../../core/tests/full-application.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new NotesLogic(app.frontend));
}

function readNotes(db: TestDatabase) {
  return db
    .selectFrom("note")
    .select(["id", "userId", "title", "body"])
    .orderBy("createdAt")
    .execute();
}

/** What the activity feature recorded, oldest first. */
function readActivity(db: TestDatabase) {
  return db
    .selectFrom("activity")
    .select(["userId", "action", "subjectId"])
    .orderBy("createdAt")
    .execute();
}

/** Create a note as the signed-in user does, through the API. */
async function seedNote(
  { frontend }: Pick<FullApplication, "frontend">,
  content: { title: string; body: string },
) {
  const response = await frontend.api.notes.$post({ json: content });
  if (response.status !== 201) {
    throw new Error("Seeding a note failed");
  }
  const { note } = await response.json();
  return note;
}

const FIRST = { title: "First", body: "The first note" };
const SECOND = { title: "Second", body: "The second note" };

describe("NotesLogic tests", () => {
  it("should load the user's notes, the most recently changed one first", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { logic } = app;
    const first = await seedNote(app, FIRST);
    const second = await seedNote(app, SECOND);

    expect(logic.state.loadState).toEqual("pristine");
    expect(logic.state.loadError).toEqual(null);
    expect(logic.state.notes).toEqual([]);

    const initializeP = logic.initialize();
    await Promise.resolve();
    expect(logic.state.loadState).toEqual("running");
    await initializeP;

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.loadError).toEqual(null);
    expect(logic.state.notes).toEqual([second, first]);
  });

  it("should set the error state when the connection fails, then load on the next attempt", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { logic, transport } = app;
    const first = await seedNote(app, FIRST);
    transport.goOffline();

    await logic.initialize();

    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual("Failed to fetch");
    expect(logic.state.notes).toEqual([]);

    transport.goOnline();
    const loadP = logic.load();
    expect(logic.state.loadState).toEqual("running");
    expect(logic.state.loadError).toEqual(null);
    await loadP;

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.notes).toEqual([first]);
  });

  it("should set the error state when nobody is signed in", async () => {
    const { logic } = await setupTest({ authenticated: false });

    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual("Sign in to continue");
    expect(logic.state.notes).toEqual([]);
  });

  it("should not load a note that belongs to another user, and should not delete it", async () => {
    const { backend, logic } = await setupTest();
    // No route lets a second user sign in, so the trusted setup operation and
    // a direct row create this condition.
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

    await logic.load();
    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.notes).toEqual([]);

    const removeP = logic.remove(foreign.id);
    expect(logic.state.removeState).toEqual("running");
    await removeP;

    expect(logic.state.removeState).toEqual("error");
    expect(logic.state.removeError).toEqual("This note does not exist");
    expect(await readNotes(backend.db)).toEqual([
      { id: foreign.id, userId: other.id, title: "Private", body: "Not yours" },
    ]);
    expect(await readActivity(backend.db)).toEqual([]);
  });

  it("should afford creating a note", async () => {
    const { backend, logic, owner, transport } = await setupTest();
    logic.setNewTitle(FIRST.title);
    logic.setNewBody(FIRST.body);

    expect(logic.state.createState).toEqual("pristine");
    expect(logic.state.createError).toEqual(null);
    expect(logic.state.notes).toEqual([]);
    expect(await readNotes(backend.db)).toEqual([]);
    expect(await readActivity(backend.db)).toEqual([]);

    const held = transport.holdNextRequest();
    const createP = logic.create();
    await held.reached;
    expect(logic.state.createState).toEqual("running");
    expect(logic.state.notes).toEqual([]);
    expect(await readNotes(backend.db)).toEqual([]);
    expect(await readActivity(backend.db)).toEqual([]);
    held.release();
    await createP;

    expect(logic.state.createState).toEqual("success");
    expect(logic.state.createError).toEqual(null);
    expect(logic.state.notes).toMatchObject([FIRST]);
    expect(logic.state.newTitle).toEqual("");
    expect(logic.state.newBody).toEqual("");
    expect(await readNotes(backend.db)).toEqual([
      { id: logic.state.notes[0]?.id, userId: owner.id, ...FIRST },
    ]);
    expect(await readActivity(backend.db)).toEqual([
      {
        userId: owner.id,
        action: "note.created",
        subjectId: logic.state.notes[0]?.id,
      },
    ]);
  });

  it("should store neither the note nor its activity record when one of the two writes fails", async () => {
    const { backend, logic } = await setupTest();
    // Without its table, the activity write fails after the note write.
    await backend.db.schema.dropTable("activity").execute();
    logic.setNewTitle(FIRST.title);
    logic.setNewBody(FIRST.body);

    expect(logic.state.createState).toEqual("pristine");
    expect(await readNotes(backend.db)).toEqual([]);

    const createP = logic.create();
    expect(logic.state.createState).toEqual("running");
    await createP;

    expect(logic.state.createState).toEqual("error");
    expect(logic.state.createError).toEqual("Internal server error");
    expect(logic.state.notes).toEqual([]);
    expect(await readNotes(backend.db)).toEqual([]);
  });

  it("should set the error state and store nothing when the new title is empty", async () => {
    const { backend, logic } = await setupTest();
    logic.setNewTitle("   ");
    logic.setNewBody(FIRST.body);

    expect(logic.state.createState).toEqual("pristine");
    expect(await readNotes(backend.db)).toEqual([]);

    const createP = logic.create();
    expect(logic.state.createState).toEqual("running");
    await createP;

    expect(logic.state.createState).toEqual("error");
    expect(logic.state.createError).toEqual("The request is invalid");
    expect(logic.state.createFieldErrors).toEqual({ title: "Enter a title" });
    expect(logic.state.notes).toEqual([]);
    // The form keeps what the user typed.
    expect(logic.state.newTitle).toEqual("   ");
    expect(logic.state.newBody).toEqual(FIRST.body);
    expect(await readNotes(backend.db)).toEqual([]);
  });

  it("should set the error state and store nothing when the session has expired", async () => {
    const { backend, logic } = await setupTest();
    await backend.db
      .updateTable("session")
      .set({ expiresAt: new Date(0) })
      .execute();
    logic.setNewTitle(FIRST.title);

    expect(logic.state.createState).toEqual("pristine");

    const createP = logic.create();
    expect(logic.state.createState).toEqual("running");
    await createP;

    expect(logic.state.createState).toEqual("error");
    expect(logic.state.createError).toEqual("Sign in to continue");
    expect(logic.state.notes).toEqual([]);
    expect(await readNotes(backend.db)).toEqual([]);
  });

  it("should create one note when create is called again while it runs", async () => {
    const { backend, logic, transport } = await setupTest();
    logic.setNewTitle(FIRST.title);
    logic.setNewBody(FIRST.body);
    const held = transport.holdNextRequest();

    const firstP = logic.create();
    const secondP = logic.create();
    await held.reached;
    expect(logic.state.createState).toEqual("running");
    expect(await readNotes(backend.db)).toEqual([]);

    held.release();
    await Promise.all([firstP, secondP]);

    expect(logic.state.createState).toEqual("success");
    expect(logic.state.notes).toMatchObject([FIRST]);
    expect(await readNotes(backend.db)).toMatchObject([FIRST]);
  });

  it("should afford changing a note, and move it to the top of the list", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic, owner } = app;
    const first = await seedNote(app, FIRST);
    const second = await seedNote(app, SECOND);
    await logic.initialize();
    const changed = { title: "First, changed", body: "A new body" };

    logic.startEditing(first.id);
    expect(logic.state.editingNoteId).toEqual(first.id);
    expect(logic.state.editTitle).toEqual(FIRST.title);
    expect(logic.state.editBody).toEqual(FIRST.body);
    logic.setEditTitle(changed.title);
    logic.setEditBody(changed.body);

    expect(logic.state.saveState).toEqual("pristine");
    expect(logic.state.saveError).toEqual(null);
    expect(logic.state.notes).toEqual([second, first]);

    const saveP = logic.save();
    expect(logic.state.saveState).toEqual("running");
    await saveP;

    expect(logic.state.saveState).toEqual("success");
    expect(logic.state.saveError).toEqual(null);
    expect(logic.state.notes).toMatchObject([
      { id: first.id, ...changed },
      second,
    ]);
    expect(logic.state.editingNoteId).toEqual(null);
    expect(logic.state.editTitle).toEqual("");
    expect(logic.state.editBody).toEqual("");
    expect(await readNotes(backend.db)).toEqual([
      { id: first.id, userId: owner.id, ...changed },
      { id: second.id, userId: owner.id, ...SECOND },
    ]);
    expect(await readActivity(backend.db)).toEqual([
      { userId: owner.id, action: "note.created", subjectId: first.id },
      { userId: owner.id, action: "note.created", subjectId: second.id },
      { userId: owner.id, action: "note.updated", subjectId: first.id },
    ]);
  });

  it("should set the error state and change nothing when the changed title is too long", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic, owner } = app;
    const first = await seedNote(app, FIRST);
    await logic.initialize();
    logic.startEditing(first.id);
    logic.setEditTitle("x".repeat(201));

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
    expect(logic.state.notes).toEqual([first]);
    // The form stays open with what the user typed.
    expect(logic.state.editingNoteId).toEqual(first.id);
    expect(logic.state.editTitle).toEqual("x".repeat(201));
    expect(await readNotes(backend.db)).toEqual([
      { id: first.id, userId: owner.id, ...FIRST },
    ]);
  });

  it("should set the error state when the note was deleted in the meantime", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    const first = await seedNote(app, FIRST);
    await logic.initialize();
    logic.startEditing(first.id);
    logic.setEditTitle("Changed");
    await backend.db.deleteFrom("note").execute();

    expect(logic.state.saveState).toEqual("pristine");

    const saveP = logic.save();
    expect(logic.state.saveState).toEqual("running");
    await saveP;

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual("This note does not exist");
    expect(logic.state.editingNoteId).toEqual(first.id);
    expect(await readNotes(backend.db)).toEqual([]);
    expect(await readActivity(backend.db)).toMatchObject([
      { action: "note.created", subjectId: first.id },
    ]);
  });

  it("should do nothing on save when no note is in the edit form", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic, owner } = app;
    const first = await seedNote(app, FIRST);
    await logic.initialize();

    // An unknown ID opens no form, and a cancelled form is closed.
    logic.startEditing("no-such-note");
    expect(logic.state.editingNoteId).toEqual(null);
    logic.startEditing(first.id);
    logic.setEditTitle("Changed");
    logic.cancelEditing();
    expect(logic.state.editingNoteId).toEqual(null);
    expect(logic.state.editTitle).toEqual("");

    await logic.save();

    expect(logic.state.saveState).toEqual("pristine");
    expect(logic.state.notes).toEqual([first]);
    expect(await readNotes(backend.db)).toEqual([
      { id: first.id, userId: owner.id, ...FIRST },
    ]);
  });

  it("should afford deleting a note, and close the edit form that holds it", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic, owner, transport } = app;
    const first = await seedNote(app, FIRST);
    const second = await seedNote(app, SECOND);
    await logic.initialize();
    logic.startEditing(first.id);

    expect(logic.state.removeState).toEqual("pristine");
    expect(logic.state.removeError).toEqual(null);
    expect(logic.state.notes).toEqual([second, first]);

    const held = transport.holdNextRequest();
    const removeP = logic.remove(first.id);
    await held.reached;
    expect(logic.state.removeState).toEqual("running");
    expect(logic.state.notes).toEqual([second, first]);
    expect(await readNotes(backend.db)).toHaveLength(2);
    held.release();
    await removeP;

    expect(logic.state.removeState).toEqual("success");
    expect(logic.state.removeError).toEqual(null);
    expect(logic.state.notes).toEqual([second]);
    expect(logic.state.editingNoteId).toEqual(null);
    expect(await readNotes(backend.db)).toEqual([
      { id: second.id, userId: owner.id, ...SECOND },
    ]);
    expect(await readActivity(backend.db)).toEqual([
      { userId: owner.id, action: "note.created", subjectId: first.id },
      { userId: owner.id, action: "note.created", subjectId: second.id },
      { userId: owner.id, action: "note.deleted", subjectId: first.id },
    ]);
  });

  it("should set the error state and keep the note when the connection fails", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic, owner, transport } = app;
    const first = await seedNote(app, FIRST);
    await logic.initialize();
    transport.goOffline();

    expect(logic.state.removeState).toEqual("pristine");

    const removeP = logic.remove(first.id);
    expect(logic.state.removeState).toEqual("running");
    await removeP;

    expect(logic.state.removeState).toEqual("error");
    expect(logic.state.removeError).toEqual("Failed to fetch");
    expect(logic.state.notes).toEqual([first]);
    expect(await readNotes(backend.db)).toEqual([
      { id: first.id, userId: owner.id, ...FIRST },
    ]);
  });
});
