import { describe, expect, it, vi } from "vitest";
import { AuthLogic } from "./auth-logic.js";
import type { AuthEvent } from "../types.js";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
  type TestDatabase,
} from "../../core/tests/full-application.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCELLED = "The passkey request was cancelled or timed out. Try again.";
const NOT_CHECKED = "The passkey could not be checked. Try again.";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new AuthLogic(app.frontend));
}

/**
 * A test that starts where a visitor of the page starts: signed out, with the
 * passkey of the owner on this device.
 */
async function setupSignedOutTest(params: LogicTestParams = {}) {
  const app = await setupTest({ authenticated: false, ...params });
  app.frontend.services.passkeys.useOwnerPasskey(app.owner.passkey);
  return app;
}

/** A new instance: the database holds no passkey, so the page sets it up. */
async function setupNewInstanceTest(params: LogicTestParams = {}) {
  const app = await setupTest({
    authenticated: false,
    skipInitialization: true,
    ...params,
  });
  await app.backend.db.deleteFrom("passkeys").execute();
  await app.logic.initialize();
  return app;
}

function readSessions(db: TestDatabase) {
  return db.selectFrom("authSessions").selectAll().execute();
}

async function readPasskeyIds(db: TestDatabase) {
  const passkeys = await db.selectFrom("passkeys").select("id").execute();
  return passkeys.map((passkey) => passkey.id);
}

async function countRows(
  db: TestDatabase,
  table: "authAttempts" | "authChallenges",
) {
  return (await db.selectFrom(table).select("id").execute()).length;
}

/** Every event that the Logic sends from now on, in order. */
function hearEvents(logic: AuthLogic): AuthEvent[] {
  const heard: AuthEvent[] = [];
  logic.events.listen((event) => {
    heard.push(event);
  });
  return heard;
}

async function setUpWithCode(
  { logic, backend }: Pick<FullApplication, "backend"> & { logic: AuthLogic },
  setupCode = backend.config.setupCode,
) {
  logic.setSetupCode(setupCode);
  await logic.createPasskey();
}

describe("AuthLogic sign-in tests", () => {
  it("should sign in with the passkey of the owner", async () => {
    const { backend, logic, owner } = await setupSignedOutTest();

    expect(logic.state.signInState).toEqual("pristine");
    expect(logic.state.loadSessionState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.hasPasskeys).toEqual(true);
    expect(logic.state.view).toEqual("sign-in");
    expect(await readSessions(backend.db)).toEqual([]);

    const signInP = logic.signIn();
    expect(logic.state.signInState).toEqual("running");
    await signInP;

    expect(logic.state.signInState).toEqual("success");
    expect(logic.state.signInError).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(true);
    const sessions = await readSessions(backend.db);
    expect(sessions).toMatchObject([
      { ownerKey: owner.ownerKey, passkeyId: owner.passkey.id },
    ]);
    // The challenge works once.
    expect(await countRows(backend.db, "authChallenges")).toEqual(0);
    const passkey = await backend.db
      .selectFrom("passkeys")
      .select(["lastUsedAt", "backedUp"])
      .executeTakeFirstOrThrow();
    expect(passkey.lastUsedAt).not.toEqual(null);
    expect(passkey.backedUp).toEqual(1);
  });

  it("should set the error state and stay signed out when the person cancels the prompt", async () => {
    const { backend, frontend, logic } = await setupSignedOutTest();
    frontend.services.passkeys.refuseNext();

    await logic.signIn();

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual(CANCELLED);
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readSessions(backend.db)).toEqual([]);

    // The next attempt clears the message.
    await logic.signIn();

    expect(logic.state.signInState).toEqual("success");
    expect(logic.state.signInError).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(true);
  });

  it("should refuse a device that has no passkey for this site", async () => {
    const { backend, logic } = await setupTest({ authenticated: false });

    await logic.signIn();

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual(CANCELLED);
    expect(await readSessions(backend.db)).toEqual([]);
  });

  it("should refuse an answer that the passkey service cannot check", async () => {
    const { backend, frontend, logic } = await setupSignedOutTest();
    frontend.services.passkeys.tweakNext({ origin: "http://other.test" });

    await logic.signIn();

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual(NOT_CHECKED);
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readSessions(backend.db)).toEqual([]);
  });

  it("should refuse a passkey that this instance does not know", async () => {
    const { backend, logic, owner } = await setupSignedOutTest();
    await backend.db
      .insertInto("passkeys")
      .values({
        id: "another-passkey-id",
        ownerKey: owner.ownerKey,
        publicKey: "not-used",
        counter: 0,
        transportsJson: "[]",
        deviceType: "multiDevice",
        backedUp: 1,
        name: "Another",
        createdAt: 1,
      })
      .execute();
    await backend.db
      .deleteFrom("passkeys")
      .where("id", "=", owner.passkey.id)
      .execute();

    await logic.signIn();

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual(
      "This passkey does not belong to this Calocount. Use another passkey, or add one with the setup code.",
    );
    expect(await readSessions(backend.db)).toEqual([]);
  });

  it("should show the setup form when the passkeys are gone since the page loaded", async () => {
    const { backend, logic } = await setupSignedOutTest();
    await backend.db.deleteFrom("passkeys").execute();

    await logic.signIn();

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.view).toEqual("setup");
    expect(logic.state.recovery).toEqual(false);
    expect(logic.state.hasPasskeys).toEqual(false);
  });

  it("should refuse an answer to a challenge that expired", async () => {
    const { backend, logic, transport } = await setupSignedOutTest();
    const options = transport.holdNextRequest();
    const verify = transport.holdNextRequest();

    const signInP = logic.signIn();
    await options.reached;
    options.release();
    await verify.reached;
    backend.services.clock.advance(6 * 60 * 1000);
    verify.release();
    await signInP;

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual("The request expired. Try again.");
    expect(await readSessions(backend.db)).toEqual([]);
  });

  it("should ignore a second sign-in while the first one runs", async () => {
    const { backend, logic } = await setupSignedOutTest();

    const first = logic.signIn();
    await logic.signIn();
    await first;

    expect(logic.state.signInState).toEqual("success");
    expect(await readSessions(backend.db)).toHaveLength(1);
  });

  it("should report that the app cannot be reached when the page has no connection", async () => {
    const { logic, transport } = await setupSignedOutTest();
    transport.goOffline();

    await logic.signIn();

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual(
      "Calocount could not be reached. Try again.",
    );
    expect(logic.state.isSignedIn).toEqual(false);
  });
});

describe("AuthLogic setup tests", () => {
  it("should save the first passkey with the setup code and start a session", async () => {
    const app = await setupNewInstanceTest();
    const { backend, logic } = app;

    expect(logic.state.hasPasskeys).toEqual(false);
    expect(logic.state.view).toEqual("setup");
    expect(logic.state.setupCodeState).toEqual("ready");
    expect(await readPasskeyIds(backend.db)).toEqual([]);

    logic.setSetupCode(backend.config.setupCode);
    const createP = logic.createPasskey();
    expect(logic.state.createPasskeyState).toEqual("running");
    await createP;

    expect(logic.state.createPasskeyState).toEqual("success");
    expect(logic.state.createPasskeyError).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.setupCode).toEqual("");
    const passkeys = await readPasskeyIds(backend.db);
    expect(passkeys).toHaveLength(1);
    expect(await readSessions(backend.db)).toMatchObject([
      { passkeyId: passkeys[0] },
    ]);
    // A correct code does not count against the limit.
    expect(await countRows(backend.db, "authAttempts")).toEqual(0);
  });

  it("should refuse a wrong setup code and save nothing", async () => {
    const { backend, logic } = await setupNewInstanceTest();

    await setUpWithCode({ logic, backend }, "wrong-setup-code");

    expect(logic.state.createPasskeyState).toEqual("error");
    expect(logic.state.createPasskeyError).toEqual(
      "This setup code is not correct.",
    );
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readPasskeyIds(backend.db)).toEqual([]);
    expect(await readSessions(backend.db)).toEqual([]);
    // One row for the network and one for all networks.
    expect(await countRows(backend.db, "authAttempts")).toEqual(2);
  });

  it("should ask for a setup code before it sends a request", async () => {
    const { backend, logic } = await setupNewInstanceTest();

    await logic.createPasskey();

    expect(logic.state.createPasskeyError).toEqual("Type the setup code.");
    expect(await countRows(backend.db, "authAttempts")).toEqual(0);
  });

  it("should stop a network after ten wrong setup codes, until the window ends", async () => {
    const { backend, logic } = await setupNewInstanceTest();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await setUpWithCode({ logic, backend }, "wrong-setup-code");
      expect(logic.state.createPasskeyError).toEqual(
        "This setup code is not correct.",
      );
    }

    await setUpWithCode({ logic, backend }, "wrong-setup-code");

    const waitMessage =
      "Too many wrong setup codes. Wait 15 minutes, then try again.";
    expect(logic.state.createPasskeyError).toEqual(waitMessage);
    // The refused attempt leaves no rows, and the limit holds for the right code too.
    expect(await countRows(backend.db, "authAttempts")).toEqual(20);
    await setUpWithCode({ logic, backend });
    expect(logic.state.createPasskeyError).toEqual(waitMessage);
    expect(logic.state.isSignedIn).toEqual(false);

    backend.services.clock.advance(16 * 60 * 1000);
    await setUpWithCode({ logic, backend });

    expect(logic.state.createPasskeyState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(true);
  });

  it("should tell the owner when the instance has no setup code", async () => {
    const { backend, logic } = await setupNewInstanceTest({
      backendOptions: { config: { setupCode: "" } },
    });

    expect(logic.state.setupCodeState).toEqual("missing");

    await setUpWithCode({ logic, backend }, "some-setup-code");

    expect(logic.state.createPasskeyError).toEqual(
      "This Calocount has no setup code yet. Add the secret CALOCOUNT_SETUP_CODE to the Worker, then try again.",
    );
    expect(await readPasskeyIds(backend.db)).toEqual([]);
  });

  it("should tell the owner when the setup code is too short", async () => {
    const { backend, logic } = await setupNewInstanceTest({
      backendOptions: { config: { setupCode: "short" } },
    });

    expect(logic.state.setupCodeState).toEqual("too_short");

    await setUpWithCode({ logic, backend }, "short");

    expect(logic.state.createPasskeyState).toEqual("error");
    expect(logic.state.createPasskeyError).toEqual(
      "The setup code of this Calocount is too short. Change the secret CALOCOUNT_SETUP_CODE to at least 12 characters, then try again.",
    );
    expect(await readPasskeyIds(backend.db)).toEqual([]);
  });

  it("should leave the instance as it was when the person cancels the prompt", async () => {
    const { backend, frontend, logic } = await setupNewInstanceTest();
    frontend.services.passkeys.refuseNext();

    await setUpWithCode({ logic, backend });

    expect(logic.state.createPasskeyError).toEqual(CANCELLED);
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readPasskeyIds(backend.db)).toEqual([]);
  });

  it("should add a passkey for a new device with the setup code of a lost one", async () => {
    // This device has no passkey of the owner.
    const { backend, logic, owner } = await setupTest({
      authenticated: false,
    });

    logic.showRecovery();

    expect(logic.state.view).toEqual("setup");
    expect(logic.state.recovery).toEqual(true);

    await setUpWithCode({ logic, backend });

    expect(logic.state.createPasskeyState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(true);
    const passkeys = await readPasskeyIds(backend.db);
    expect(passkeys).toHaveLength(2);
    expect(passkeys).toContain(owner.passkey.id);
  });

  it("should refuse a second passkey on a device that already has one", async () => {
    const { backend, logic } = await setupSignedOutTest();

    logic.showRecovery();
    await setUpWithCode({ logic, backend });

    expect(logic.state.createPasskeyState).toEqual("error");
    expect(logic.state.createPasskeyError).toEqual(
      "This device already has a passkey for this Calocount. Sign in with it.",
    );
    expect(await readPasskeyIds(backend.db)).toHaveLength(1);
  });

  it("should go back to the sign-in form from the recovery form", async () => {
    const { logic } = await setupSignedOutTest();
    logic.showRecovery();
    await logic.createPasskey();

    expect(logic.state.createPasskeyError).toEqual("Type the setup code.");

    logic.showSignIn();

    expect(logic.state.view).toEqual("sign-in");
    expect(logic.state.recovery).toEqual(false);
    expect(logic.state.createPasskeyState).toEqual("pristine");
    expect(logic.state.createPasskeyError).toEqual(null);
  });
});

describe("AuthLogic session tests", () => {
  it("should report a browser with no passkeys", async () => {
    const { frontend, logic } = await setupTest({ authenticated: false });

    expect(logic.canUsePasskeys).toEqual(true);

    frontend.services.passkeys.removeSupport();

    expect(logic.canUsePasskeys).toEqual(false);
  });

  it("should report a failed session check, and recover when the connection is back", async () => {
    const { logic, transport } = await setupTest({
      authenticated: false,
      skipInitialization: true,
    });
    transport.goOffline();

    await logic.initialize();

    expect(logic.state.loadSessionState).toEqual("error");
    expect(logic.state.loadSessionError).toEqual(
      "Calocount could not check the sign-in. Try again.",
    );
    expect(logic.state.isSignedIn).toEqual(false);

    transport.goOnline();
    await logic.refresh();

    expect(logic.state.loadSessionState).toEqual("success");
    expect(logic.state.loadSessionError).toEqual(null);
  });

  it("should sign out, and send the event", async () => {
    const { backend, logic, transport } = await setupTest();
    const heard = hearEvents(logic);

    expect(logic.state.isSignedIn).toEqual(true);
    expect(await readSessions(backend.db)).toHaveLength(1);

    const signOutP = logic.signOut();
    expect(logic.state.signOutState).toEqual("running");
    await signOutP;

    expect(logic.state.signOutState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.view).toEqual("sign-in");
    expect(heard).toEqual([{ type: "signedOut" }]);
    expect(await readSessions(backend.db)).toEqual([]);
    // The cookie is gone from the browser, too.
    expect(
      (await transport.fetch("http://app.test/api/auth/passkeys")).status,
    ).toEqual(401);
  });

  it("should stay signed in when the sign-out request does not arrive", async () => {
    const { backend, logic, transport } = await setupTest();
    const heard = hearEvents(logic);
    transport.goOffline();

    await logic.signOut();

    expect(logic.state.signOutState).toEqual("error");
    expect(logic.state.signOutError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.isSignedIn).toEqual(true);
    expect(heard).toEqual([]);
    expect(await readSessions(backend.db)).toHaveLength(1);
  });

  it("should end the session when the backend refuses a request for it", async () => {
    const { backend, frontend, logic } = await setupTest();
    await backend.db.deleteFrom("authSessions").execute();

    // Any request of the app can find out. Here, the passkey list does.
    const response = await frontend.api.auth.passkeys.$get();

    expect(response.status).toEqual(401);
    await vi.waitFor(() => expect(logic.state.isSignedIn).toEqual(false));
    expect(logic.state.view).toEqual("sign-in");
  });

  it("should check the session again when the window gets focus", async () => {
    const { backend, frontend, logic } = await setupTest();
    await backend.db.deleteFrom("authSessions").execute();

    frontend.services.windowFocus.focus();

    await vi.waitFor(() => expect(logic.state.isSignedIn).toEqual(false));
  });

  it("should renew a session that was last seen a day ago, and end one that nobody used for 180 days", async () => {
    const { backend, logic } = await setupTest();
    const [before] = await readSessions(backend.db);

    backend.services.clock.advance(60 * 60 * 1000);
    await logic.refresh();
    const [sameDay] = await readSessions(backend.db);
    expect(sameDay?.expiresAt).toEqual(before?.expiresAt);

    backend.services.clock.advance(2 * DAY_MS);
    await logic.refresh();
    const [renewed] = await readSessions(backend.db);
    expect(renewed?.lastSeenAt).toBeGreaterThan(before?.lastSeenAt ?? 0);
    expect(renewed?.expiresAt).toBeGreaterThan(
      (before?.expiresAt ?? 0) + 2 * DAY_MS,
    );
    expect(logic.state.isSignedIn).toEqual(true);

    backend.services.clock.advance(181 * DAY_MS);
    await logic.refresh();

    expect(logic.state.isSignedIn).toEqual(false);
  });
});
