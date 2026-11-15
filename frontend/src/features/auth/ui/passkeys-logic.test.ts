import { describe, expect, it } from "vitest";
import { PasskeysLogic } from "./passkeys-logic.js";
import {
  setupLogicTest,
  type LogicTestParams,
  type TestDatabase,
} from "../../core/tests/full-application.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new PasskeysLogic(app.frontend));
}

async function readPasskeyIds(db: TestDatabase) {
  const passkeys = await db
    .selectFrom("passkeys")
    .select("id")
    .orderBy("createdAt")
    .execute();
  return passkeys.map((passkey) => passkey.id);
}

describe("PasskeysLogic tests", () => {
  it("should list the passkeys, and mark the one that signed in", async () => {
    const { logic, owner } = await setupTest();

    expect(logic.state.loadPasskeysState).toEqual("success");
    expect(logic.state.passkeys).toMatchObject([
      { id: owner.passkey.id, name: "Owner", synced: true, current: true },
    ]);
  });

  it("should show the error when the passkeys cannot be read without a session", async () => {
    const { logic } = await setupTest({ authenticated: false });

    expect(logic.state.loadPasskeysState).toEqual("error");
    expect(logic.state.loadPasskeysError).toEqual("Sign in to continue.");
    expect(logic.state.passkeys).toEqual([]);
  });

  it("should add a passkey for this device, with no setup code", async () => {
    const { backend, logic, owner } = await setupTest();

    const addP = logic.addPasskey();
    expect(logic.state.addPasskeyState).toEqual("running");
    await addP;

    expect(logic.state.addPasskeyState).toEqual("success");
    expect(logic.state.addPasskeyError).toEqual(null);
    expect(logic.state.passkeys).toHaveLength(2);
    expect(await readPasskeyIds(backend.db)).toHaveLength(2);
    expect(logic.state.passkeys.filter(({ current }) => current)).toMatchObject(
      [{ id: owner.passkey.id }],
    );
  });

  it("should add nothing when the person cancels the prompt", async () => {
    const { backend, frontend, logic } = await setupTest();
    frontend.services.passkeys.refuseNext();

    await logic.addPasskey();

    expect(logic.state.addPasskeyState).toEqual("error");
    expect(logic.state.addPasskeyError).toEqual(
      "The passkey request was cancelled or timed out. Try again.",
    );
    expect(await readPasskeyIds(backend.db)).toHaveLength(1);
  });

  it("should refuse a device that already has a passkey", async () => {
    const { backend, frontend, logic, owner } = await setupTest();
    frontend.services.passkeys.useOwnerPasskey(owner.passkey);

    await logic.addPasskey();

    expect(logic.state.addPasskeyState).toEqual("error");
    expect(logic.state.addPasskeyError).toEqual(
      "This device already has a passkey for this Calocount. Sign in with it.",
    );
    expect(await readPasskeyIds(backend.db)).toHaveLength(1);
  });

  it("should remove the passkey of another device", async () => {
    const { backend, logic, owner } = await setupTest();
    await logic.addPasskey();
    const other = logic.state.passkeys.find(({ current }) => !current);

    const removeP = logic.removePasskey({ id: other?.id ?? "" });
    expect(logic.state.removePasskeyState).toEqual("running");
    await removeP;

    expect(logic.state.removePasskeyState).toEqual("success");
    expect(logic.state.passkeys.map(({ id }) => id)).toEqual([
      owner.passkey.id,
    ]);
    expect(await readPasskeyIds(backend.db)).toEqual([owner.passkey.id]);
  });

  it("should ask before it removes a passkey, and remove nothing on a no", async () => {
    const { backend, frontend, logic } = await setupTest();
    await logic.addPasskey();
    const other = logic.state.passkeys.find(({ current }) => !current);
    frontend.services.dialogs.answerWith(false);

    await logic.removePasskey({ id: other?.id ?? "" });

    expect(frontend.services.dialogs.questions).toEqual([
      `Remove the passkey "${other?.name}"? Devices that signed in with it sign out.`,
    ]);
    expect(logic.state.removePasskeyState).toEqual("pristine");
    expect(await readPasskeyIds(backend.db)).toHaveLength(2);
  });

  it("should warn that the device signs out when the passkey is the one in use", async () => {
    const { frontend, logic, owner } = await setupTest();
    await logic.addPasskey();

    await logic.removePasskey({ id: owner.passkey.id });

    expect(frontend.services.dialogs.questions).toEqual([
      'Remove the passkey "Owner"? You signed in with it, so this device signs out.',
    ]);
  });

  it("should end the session of a passkey with its removal", async () => {
    const { backend, logic, owner } = await setupTest();
    await logic.addPasskey();

    await logic.removePasskey({ id: owner.passkey.id });

    expect(logic.state.removePasskeyState).toEqual("success");
    expect(logic.state.passkeys.map(({ id }) => id)).not.toContain(
      owner.passkey.id,
    );
    expect(
      await backend.db.selectFrom("authSessions").selectAll().execute(),
    ).toEqual([]);
  });

  it("should keep the last passkey", async () => {
    const { backend, logic, owner } = await setupTest();

    await logic.removePasskey({ id: owner.passkey.id });

    expect(logic.state.removePasskeyState).toEqual("error");
    expect(logic.state.removePasskeyError).toEqual(
      "Add another passkey before you remove this one.",
    );
    expect(logic.state.passkeys).toHaveLength(1);
    expect(await readPasskeyIds(backend.db)).toEqual([owner.passkey.id]);
    expect(
      await backend.db.selectFrom("authSessions").selectAll().execute(),
    ).toHaveLength(1);
  });

  it("should report a passkey that does not exist", async () => {
    const { backend, logic } = await setupTest();
    await logic.addPasskey();

    await logic.removePasskey({ id: "no-such-passkey" });

    expect(logic.state.removePasskeyState).toEqual("error");
    expect(logic.state.removePasskeyError).toEqual("Passkey not found.");
    expect(await readPasskeyIds(backend.db)).toHaveLength(2);
  });
});
