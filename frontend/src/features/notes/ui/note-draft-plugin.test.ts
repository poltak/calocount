import { describe, expect, it } from "vitest";
import { NoteDraftPlugin } from "./note-draft-plugin.js";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const TYPED = { title: "Typed title", body: "Typed body" };

/** The plugin for the edit form of one note, as `NoteEditLogic` creates it. */
async function setupTest(params: LogicTestParams = {}) {
  const test = await setupLogicTest(
    params,
    (app) =>
      new NoteDraftPlugin({
        storage: app.frontend.storage,
        owner: { userId: app.owner.id, noteId: NOTE_ID },
      }),
  );
  return {
    ...test,
    /** The browser storage entry of this draft. */
    draftKey: `notes.draft.${test.owner.id}.${NOTE_ID}`,
  };
}

describe("NoteDraftPlugin tests", () => {
  it("should keep what the user types in browser storage", async () => {
    const { frontend, logic, draftKey } = await setupTest();

    expect(logic.state).toEqual({ title: "", body: "", isRestored: false });
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(null);

    logic.setTitle(TYPED.title);
    expect(logic.state.title).toEqual(TYPED.title);
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(
      JSON.stringify({ title: TYPED.title, body: "" }),
    );

    logic.setBody(TYPED.body);
    expect(logic.state).toEqual({ ...TYPED, isRestored: false });
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(
      JSON.stringify(TYPED),
    );
  });

  it("should restore the stored draft when it starts", async () => {
    const { frontend, logic, draftKey } = await setupTest({
      skipInitialization: true,
    });
    frontend.browserStorage.setItem(draftKey, JSON.stringify(TYPED));

    expect(logic.state).toEqual({ title: "", body: "", isRestored: false });

    await logic.initialize();

    expect(logic.state).toEqual({ ...TYPED, isRestored: true });
  });

  it("should not restore the draft of another note or of another user", async () => {
    const { frontend, logic, owner } = await setupTest({
      skipInitialization: true,
    });
    frontend.browserStorage.setItem(
      `notes.draft.${owner.id}.new`,
      JSON.stringify(TYPED),
    );
    frontend.browserStorage.setItem(
      `notes.draft.another-user.${NOTE_ID}`,
      JSON.stringify(TYPED),
    );

    await logic.initialize();

    expect(logic.state).toEqual({ title: "", body: "", isRestored: false });
  });

  it("should ignore a stored value that is not a draft", async () => {
    // Text that is not JSON, and JSON that does not have a draft's fields.
    for (const stored of ["not a draft", JSON.stringify({ title: 1 })]) {
      const { frontend, logic, draftKey } = await setupTest({
        skipInitialization: true,
      });
      frontend.browserStorage.setItem(draftKey, stored);

      await logic.initialize();

      expect(logic.state).toEqual({ title: "", body: "", isRestored: false });
    }
  });

  it("should start from the saved note only when no draft was restored", async () => {
    const saved = { title: "Saved title", body: "Saved body" };
    const { frontend, logic, draftKey } = await setupTest();

    logic.startFrom(saved);

    expect(logic.state).toEqual({ ...saved, isRestored: false });
    // Saved content is not a draft, so nothing is stored.
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(null);

    const restored = await setupTest({ skipInitialization: true });
    restored.frontend.browserStorage.setItem(
      restored.draftKey,
      JSON.stringify(TYPED),
    );
    await restored.logic.initialize();

    restored.logic.startFrom(saved);

    expect(restored.logic.state).toEqual({ ...TYPED, isRestored: true });
  });

  it("should empty the form and the browser storage on discard", async () => {
    const { frontend, logic, draftKey } = await setupTest();
    logic.setTitle(TYPED.title);
    logic.setBody(TYPED.body);

    expect(frontend.browserStorage.getItem(draftKey)).not.toEqual(null);

    logic.discard();

    expect(logic.state).toEqual({ title: "", body: "", isRestored: false });
    expect(frontend.browserStorage.getItem(draftKey)).toEqual(null);
  });
});
