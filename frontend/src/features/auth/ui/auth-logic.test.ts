import { InitializationCancelledError } from "@app/common/features/core/logic/logic";
import { describe, expect, it, vi } from "vitest";
import { AuthLogic } from "./auth-logic.js";
import {
  setupLogicTest,
  type LogicTestParams,
  type TestDatabase,
} from "../../core/tests/full-application.js";
import { TEST_OWNER_CREDENTIALS } from "../../core/tests/test-owner.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new AuthLogic(app.frontend));
}

function readUser(db: TestDatabase, email: string) {
  return db
    .selectFrom("user")
    .select(["id", "email", "name"])
    .where("email", "=", email)
    .executeTakeFirst();
}

async function readUserEmails(db: TestDatabase) {
  const users = await db
    .selectFrom("user")
    .select("email")
    .orderBy("createdAt")
    .execute();
  return users.map((user) => user.email);
}

async function readSessionUserIds(db: TestDatabase) {
  const sessions = await db.selectFrom("session").select("userId").execute();
  return sessions.map((session) => session.userId);
}

/**
 * The auth SDK counts the attempts on one of its routes, such as
 * `/sign-in/email`, in one row for each caller address.
 */
async function readAttemptCounts(db: TestDatabase, route: string) {
  const rows = await db
    .selectFrom("rateLimit")
    .select("count")
    .where("key", "like", `%${route}`)
    .execute();
  return rows.map((row) => row.count);
}

const VISITOR = {
  name: "New User",
  email: "new-user@example.test",
  password: "a-test-password-for-sign-up",
};

function setupSignUpTest(params: LogicTestParams = {}) {
  return setupTest({
    authenticated: false,
    accountMode: "openSignUp",
    ...params,
  });
}

function fillSignUpForm(logic: AuthLogic, fields: typeof VISITOR = VISITOR) {
  logic.setSignUpName(fields.name);
  logic.setEmail(fields.email);
  logic.setPassword(fields.password);
}

describe("AuthLogic tests", () => {
  it("should afford successful updating existing user's name", async () => {
    const { backend, logic, owner } = await setupTest();

    const NEXT_NAME = "pre_" + owner.name + "_changed";

    expect(logic.state.setNameState).toEqual("pristine");
    expect(logic.state.setNameError).toEqual(null);
    expect(logic.state.userName).toEqual(owner.name);
    expect(await readUser(backend.db, owner.email)).toEqual(owner);

    const setNameP = logic.setName(NEXT_NAME);
    expect(logic.state.setNameState).toEqual("running");
    await setNameP;

    expect(logic.state.setNameState).toEqual("success");
    expect(logic.state.setNameError).toEqual(null);
    expect(logic.state.userName).toEqual(NEXT_NAME);
    expect(await readUser(backend.db, owner.email)).toEqual({
      ...owner,
      name: NEXT_NAME,
    });
  });

  it("should set the error state and change nothing when the new name is empty", async () => {
    const { backend, logic, owner } = await setupTest();

    expect(logic.state.setNameState).toEqual("pristine");
    expect(logic.state.userName).toEqual(owner.name);
    expect(await readUser(backend.db, owner.email)).toEqual(owner);

    const setNameP = logic.setName("   ");
    expect(logic.state.setNameState).toEqual("running");
    await setNameP;

    expect(logic.state.setNameState).toEqual("error");
    expect(logic.state.setNameError).toEqual("The request is invalid");
    expect(logic.state.userName).toEqual(owner.name);
    expect(await readUser(backend.db, owner.email)).toEqual(owner);
  });

  it("should set the error state and sign out when the session has expired", async () => {
    const { backend, logic, owner } = await setupTest();
    await backend.db
      .updateTable("session")
      .set({ expiresAt: new Date(0) })
      .execute();

    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.setNameState).toEqual("pristine");

    const setNameP = logic.setName("Changed");
    expect(logic.state.setNameState).toEqual("running");
    await setNameP;

    expect(logic.state.setNameState).toEqual("error");
    expect(logic.state.setNameError).toEqual("Sign in to continue");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userName).toEqual(null);
    expect(await readUser(backend.db, owner.email)).toEqual(owner);
  });

  it("should set the error state when the connection fails, then succeed on the next attempt", async () => {
    const { backend, logic, owner, transport } = await setupTest();
    transport.goOffline();

    const failedP = logic.setName("Changed");
    expect(logic.state.setNameState).toEqual("running");
    await failedP;

    expect(logic.state.setNameState).toEqual("error");
    expect(logic.state.setNameError).toEqual("Failed to fetch");
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.userName).toEqual(owner.name);
    expect(await readUser(backend.db, owner.email)).toEqual(owner);

    transport.goOnline();
    const retriedP = logic.setName("Changed");
    expect(logic.state.setNameState).toEqual("running");
    expect(logic.state.setNameError).toEqual(null);
    await retriedP;

    expect(logic.state.setNameState).toEqual("success");
    expect(logic.state.userName).toEqual("Changed");
    expect(await readUser(backend.db, owner.email)).toEqual({
      ...owner,
      name: "Changed",
    });
  });

  it("should ignore a second name update while the first is running", async () => {
    const { backend, logic, owner, transport } = await setupTest();
    const held = transport.holdNextRequest();

    const firstP = logic.setName("First");
    const secondP = logic.setName("Second");
    await held.reached;
    expect(logic.state.setNameState).toEqual("running");
    expect(logic.state.userName).toEqual(owner.name);
    expect(await readUser(backend.db, owner.email)).toEqual(owner);

    held.release();
    await Promise.all([firstP, secondP]);

    expect(logic.state.setNameState).toEqual("success");
    expect(logic.state.userName).toEqual("First");
    expect(await readUser(backend.db, owner.email)).toEqual({
      ...owner,
      name: "First",
    });
  });

  it("should afford successful sign-in", async () => {
    const { backend, logic, owner } = await setupTest({ authenticated: false });
    logic.setEmail(TEST_OWNER_CREDENTIALS.email);
    logic.setPassword(TEST_OWNER_CREDENTIALS.password);

    expect(logic.state.signInState).toEqual("pristine");
    expect(logic.state.loadSessionState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userId).toEqual(null);
    expect(await readSessionUserIds(backend.db)).toEqual([]);

    const signInP = logic.signIn();
    expect(logic.state.signInState).toEqual("running");
    await signInP;

    expect(logic.state.signInState).toEqual("success");
    expect(logic.state.signInError).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.userId).toEqual(owner.id);
    expect(logic.state.userEmail).toEqual(owner.email);
    expect(logic.state.userName).toEqual(owner.name);
    expect(logic.state.password).toEqual("");
    expect(await readSessionUserIds(backend.db)).toEqual([owner.id]);
  });

  it("should set a message for each field that the backend refuses", async () => {
    const { backend, logic } = await setupTest({ authenticated: false });
    logic.setEmail("not-an-email");

    expect(logic.state.signInState).toEqual("pristine");
    expect(logic.state.signInFieldErrors).toEqual(null);

    const signInP = logic.signIn();
    expect(logic.state.signInState).toEqual("running");
    await signInP;

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual("The request is invalid");
    expect(logic.state.signInFieldErrors).toEqual({
      email: "Enter a valid email address",
      password: "Enter your password",
    });
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readSessionUserIds(backend.db)).toEqual([]);

    // The next attempt clears the messages.
    logic.setEmail(TEST_OWNER_CREDENTIALS.email);
    logic.setPassword(TEST_OWNER_CREDENTIALS.password);
    await logic.signIn();

    expect(logic.state.signInState).toEqual("success");
    expect(logic.state.signInFieldErrors).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(true);
  });

  it("should set the error state and stay signed out when the password is wrong", async () => {
    const { backend, logic } = await setupTest({ authenticated: false });
    logic.setEmail(TEST_OWNER_CREDENTIALS.email);
    logic.setPassword("wrong-password");

    expect(logic.state.signInState).toEqual("pristine");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readSessionUserIds(backend.db)).toEqual([]);

    const signInP = logic.signIn();
    expect(logic.state.signInState).toEqual("running");
    await signInP;

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual("Invalid email or password");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userId).toEqual(null);
    expect(logic.state.password).toEqual("");
    expect(await readSessionUserIds(backend.db)).toEqual([]);
  });

  it("should refuse a fourth sign-in attempt in a short time, even with the correct password", async () => {
    const { backend, logic } = await setupTest({ authenticated: false });
    logic.setEmail(TEST_OWNER_CREDENTIALS.email);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      logic.setPassword("wrong-password");
      await logic.signIn();
      expect(logic.state.signInError).toEqual("Invalid email or password");
    }
    logic.setPassword(TEST_OWNER_CREDENTIALS.password);

    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readAttemptCounts(backend.db, "/sign-in/email")).toEqual([3]);

    const signInP = logic.signIn();
    expect(logic.state.signInState).toEqual("running");
    await signInP;

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual(
      "Too many sign-in attempts. Try again later.",
    );
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.password).toEqual("");
    expect(await readSessionUserIds(backend.db)).toEqual([]);
    expect(await readAttemptCounts(backend.db, "/sign-in/email")).toEqual([3]);
  });

  it("should not admit another account even when its password is correct", async () => {
    const { backend, logic } = await setupTest({ authenticated: false });
    const other = {
      email: "other@example.test",
      name: "Other",
      password: "another-test-password",
    };
    // In single-owner mode no route can create an account, so the trusted
    // setup operation seeds it.
    const otherUser = await backend.services.auth.createAccount(other);
    logic.setEmail(other.email);
    logic.setPassword(other.password);

    expect(logic.state.signInState).toEqual("pristine");
    expect(logic.state.isSignedIn).toEqual(false);

    await logic.signIn();

    expect(logic.state.signInState).toEqual("error");
    expect(logic.state.signInError).toEqual(
      "This account does not have access",
    );
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userId).toEqual(null);
    // The SDK accepted the password; the backend refuses every request after it.
    expect(await readSessionUserIds(backend.db)).toEqual([otherUser.id]);
  });

  it("should admit another account in open sign-up mode", async () => {
    const { backend, logic } = await setupTest({
      authenticated: false,
      accountMode: "openSignUp",
    });
    const other = {
      email: "other@example.test",
      name: "Other",
      password: "another-test-password",
    };
    const otherUser = await backend.services.auth.createAccount(other);
    logic.setEmail(other.email);
    logic.setPassword(other.password);

    expect(logic.state.signInState).toEqual("pristine");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readSessionUserIds(backend.db)).toEqual([]);

    const signInP = logic.signIn();
    expect(logic.state.signInState).toEqual("running");
    await signInP;

    expect(logic.state.signInState).toEqual("success");
    expect(logic.state.signInError).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.userId).toEqual(otherUser.id);
    expect(logic.state.userName).toEqual(other.name);
    expect(await readSessionUserIds(backend.db)).toEqual([otherUser.id]);
  });

  it("should load that sign-up is open in open sign-up mode", async () => {
    const { logic } = await setupSignUpTest({ skipInitialization: true });

    expect(logic.state.loadSignUpStatusState).toEqual("pristine");
    expect(logic.state.loadSignUpStatusError).toEqual(null);
    expect(logic.state.isSignUpOpen).toEqual(false);

    await logic.initialize();

    expect(logic.state.loadSignUpStatusState).toEqual("success");
    expect(logic.state.loadSignUpStatusError).toEqual(null);
    expect(logic.state.isSignUpOpen).toEqual(true);

    // A later load shows the running state at once.
    const loadP = logic.loadSignUpStatus();
    expect(logic.state.loadSignUpStatusState).toEqual("running");
    await loadP;
    expect(logic.state.loadSignUpStatusState).toEqual("success");
    expect(logic.state.isSignUpOpen).toEqual(true);
  });

  it("should load that sign-up is closed in single-owner mode", async () => {
    const { logic } = await setupTest({
      authenticated: false,
      skipInitialization: true,
    });

    expect(logic.state.loadSignUpStatusState).toEqual("pristine");
    expect(logic.state.isSignUpOpen).toEqual(false);

    await logic.initialize();

    expect(logic.state.loadSignUpStatusState).toEqual("success");
    expect(logic.state.loadSignUpStatusError).toEqual(null);
    expect(logic.state.isSignUpOpen).toEqual(false);
  });

  it("should show sign-up as closed when the connection fails, then load it on the next attempt", async () => {
    const { logic, transport } = await setupSignUpTest({
      skipInitialization: true,
    });
    transport.goOffline();

    await logic.initialize();

    expect(logic.state.loadSignUpStatusState).toEqual("error");
    expect(logic.state.loadSignUpStatusError).toEqual("Failed to fetch");
    expect(logic.state.isSignUpOpen).toEqual(false);

    transport.goOnline();
    const loadP = logic.loadSignUpStatus();
    expect(logic.state.loadSignUpStatusState).toEqual("running");
    expect(logic.state.loadSignUpStatusError).toEqual(null);
    await loadP;

    expect(logic.state.loadSignUpStatusState).toEqual("success");
    expect(logic.state.isSignUpOpen).toEqual(true);
  });

  it("should afford successful sign-up", async () => {
    const { backend, logic, owner, transport } = await setupSignUpTest();
    fillSignUpForm(logic);

    expect(logic.state.signUpState).toEqual("pristine");
    expect(logic.state.signUpError).toEqual(null);
    expect(logic.state.signUpFieldErrors).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);
    expect(await readSessionUserIds(backend.db)).toEqual([]);

    const held = transport.holdNextRequest();
    const signUpP = logic.signUp();
    await held.reached;
    expect(logic.state.signUpState).toEqual("running");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);
    held.release();
    await signUpP;

    expect(logic.state.signUpState).toEqual("success");
    expect(logic.state.signUpError).toEqual(null);
    expect(logic.state.signUpFieldErrors).toEqual(null);
    // The backend also started the session, so the new user is signed in.
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.userEmail).toEqual(VISITOR.email);
    expect(logic.state.userName).toEqual(VISITOR.name);
    expect(logic.state.signUpName).toEqual("");
    expect(logic.state.password).toEqual("");
    expect(await readUserEmails(backend.db)).toEqual([
      owner.email,
      VISITOR.email,
    ]);
    expect(await readUser(backend.db, VISITOR.email)).toEqual({
      id: logic.state.userId,
      email: VISITOR.email,
      name: VISITOR.name,
    });
    expect(await readSessionUserIds(backend.db)).toEqual([logic.state.userId]);
  });

  it("should set a message for each sign-up field that the backend refuses", async () => {
    const { backend, logic, owner } = await setupSignUpTest();
    fillSignUpForm(logic, {
      name: "   ",
      email: "not-an-email",
      password: "short",
    });

    expect(logic.state.signUpState).toEqual("pristine");
    expect(logic.state.signUpFieldErrors).toEqual(null);

    const signUpP = logic.signUp();
    expect(logic.state.signUpState).toEqual("running");
    await signUpP;

    expect(logic.state.signUpState).toEqual("error");
    expect(logic.state.signUpError).toEqual("The request is invalid");
    expect(logic.state.signUpFieldErrors).toEqual({
      name: "Enter your name",
      email: "Enter a valid email address",
      password: "Use at least 8 characters",
    });
    expect(logic.state.isSignedIn).toEqual(false);
    // The fields stay after a refusal, so the user corrects them.
    expect(logic.state.email).toEqual("not-an-email");
    expect(logic.state.password).toEqual("short");
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);

    // The next attempt clears the messages.
    fillSignUpForm(logic);
    await logic.signUp();

    expect(logic.state.signUpState).toEqual("success");
    expect(logic.state.signUpFieldErrors).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(true);
  });

  it("should set a message at the email when the email has an account already", async () => {
    const { backend, logic, owner } = await setupSignUpTest();
    fillSignUpForm(logic, { ...VISITOR, email: owner.email });

    expect(logic.state.signUpState).toEqual("pristine");
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);

    const signUpP = logic.signUp();
    expect(logic.state.signUpState).toEqual("running");
    await signUpP;

    expect(logic.state.signUpState).toEqual("error");
    expect(logic.state.signUpError).toEqual("The request is invalid");
    expect(logic.state.signUpFieldErrors).toEqual({
      email: "An account with this email address exists already",
    });
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);
    // The owner's account is as it was: the name of the attempt is not in it.
    expect(await readUser(backend.db, owner.email)).toEqual(owner);
    expect(await readSessionUserIds(backend.db)).toEqual([]);
  });

  it("should refuse sign-up in single-owner mode", async () => {
    const { backend, logic, owner } = await setupTest({
      authenticated: false,
    });
    fillSignUpForm(logic);

    expect(logic.state.signUpState).toEqual("pristine");
    expect(logic.state.isSignUpOpen).toEqual(false);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);

    const signUpP = logic.signUp();
    expect(logic.state.signUpState).toEqual("running");
    await signUpP;

    expect(logic.state.signUpState).toEqual("error");
    expect(logic.state.signUpError).toEqual("Sign-up is closed");
    expect(logic.state.signUpFieldErrors).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);
    expect(await readSessionUserIds(backend.db)).toEqual([]);
  });

  it("should refuse a fourth sign-up attempt in a short time", async () => {
    const { backend, logic, owner } = await setupSignUpTest();
    // Three attempts that the backend refuses for another reason.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      fillSignUpForm(logic, { ...VISITOR, email: owner.email });
      await logic.signUp();
      expect(logic.state.signUpFieldErrors).toEqual({
        email: "An account with this email address exists already",
      });
    }
    fillSignUpForm(logic);

    expect(await readAttemptCounts(backend.db, "/sign-up/email")).toEqual([3]);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);

    const signUpP = logic.signUp();
    expect(logic.state.signUpState).toEqual("running");
    await signUpP;

    expect(logic.state.signUpState).toEqual("error");
    expect(logic.state.signUpError).toEqual(
      "Too many sign-up attempts. Try again later.",
    );
    expect(logic.state.signUpFieldErrors).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(false);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);
    expect(await readAttemptCounts(backend.db, "/sign-up/email")).toEqual([3]);
  });

  it("should set the error state when the connection fails, then sign up on the next attempt", async () => {
    const { backend, logic, owner, transport } = await setupSignUpTest();
    fillSignUpForm(logic);
    transport.goOffline();

    const failedP = logic.signUp();
    expect(logic.state.signUpState).toEqual("running");
    await failedP;

    expect(logic.state.signUpState).toEqual("error");
    expect(logic.state.signUpError).toEqual("Failed to fetch");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.password).toEqual(VISITOR.password);
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);

    transport.goOnline();
    const retriedP = logic.signUp();
    expect(logic.state.signUpState).toEqual("running");
    expect(logic.state.signUpError).toEqual(null);
    await retriedP;

    expect(logic.state.signUpState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.userEmail).toEqual(VISITOR.email);
    expect(await readUserEmails(backend.db)).toEqual([
      owner.email,
      VISITOR.email,
    ]);
  });

  it("should make one account when sign-up is called again while it runs", async () => {
    const { backend, logic, owner, transport } = await setupSignUpTest();
    fillSignUpForm(logic);
    const held = transport.holdNextRequest();

    const firstP = logic.signUp();
    const secondP = logic.signUp();
    await held.reached;
    expect(logic.state.signUpState).toEqual("running");
    expect(await readUserEmails(backend.db)).toEqual([owner.email]);

    held.release();
    await Promise.all([firstP, secondP]);

    expect(logic.state.signUpState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(true);
    expect(await readUserEmails(backend.db)).toEqual([
      owner.email,
      VISITOR.email,
    ]);
    expect(await readSessionUserIds(backend.db)).toEqual([logic.state.userId]);
  });

  it("should afford successful sign-out", async () => {
    const { backend, logic, owner } = await setupTest();

    expect(logic.state.signOutState).toEqual("pristine");
    expect(logic.state.isSignedIn).toEqual(true);
    expect(await readSessionUserIds(backend.db)).toEqual([owner.id]);

    const signOutP = logic.signOut();
    expect(logic.state.signOutState).toEqual("running");
    await signOutP;

    expect(logic.state.signOutState).toEqual("success");
    expect(logic.state.signOutError).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userId).toEqual(null);
    expect(logic.state.userEmail).toEqual(null);
    expect(logic.state.userName).toEqual(null);
    expect(await readSessionUserIds(backend.db)).toEqual([]);
  });

  it("should set the error state and stay signed in when sign-out cannot reach the backend", async () => {
    const { backend, logic, owner, transport } = await setupTest();
    transport.goOffline();

    const signOutP = logic.signOut();
    expect(logic.state.signOutState).toEqual("running");
    await signOutP;

    expect(logic.state.signOutState).toEqual("error");
    expect(logic.state.signOutError).toEqual("Failed to fetch");
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.userName).toEqual(owner.name);
    expect(await readSessionUserIds(backend.db)).toEqual([owner.id]);
  });

  it("should not restore access when an old session check answers after sign-out", async () => {
    const { backend, logic, transport } = await setupTest();
    const held = transport.holdNextResponse();

    const refreshP = logic.refresh();
    await held.reached;
    expect(logic.state.loadSessionState).toEqual("running");
    expect(logic.state.isSignedIn).toEqual(true);

    await logic.signOut();
    held.release();
    await refreshP;

    expect(logic.state.loadSessionState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userName).toEqual(null);
    expect(await readSessionUserIds(backend.db)).toEqual([]);
  });

  it("should stay signed out after a connection failure, then load the session on retry", async () => {
    const { logic, owner, transport } = await setupTest({
      skipInitialization: true,
    });
    transport.goOffline();

    expect(logic.state.loadSessionState).toEqual("pristine");
    expect(logic.state.isSignedIn).toEqual(false);

    const initializeP = logic.initialize();
    await initializeP;

    expect(logic.state.loadSessionState).toEqual("error");
    expect(logic.state.loadSessionError).toEqual("Failed to fetch");
    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userName).toEqual(null);

    transport.goOnline();
    const refreshP = logic.refresh();
    expect(logic.state.loadSessionState).toEqual("running");
    expect(logic.state.loadSessionError).toEqual(null);
    await refreshP;

    expect(logic.state.loadSessionState).toEqual("success");
    expect(logic.state.isSignedIn).toEqual(true);
    expect(logic.state.userName).toEqual(owner.name);
  });

  it("should check the session again when the window regains focus", async () => {
    const { backend, frontend, logic } = await setupTest();
    await backend.db.deleteFrom("session").execute();

    expect(logic.state.isSignedIn).toEqual(true);

    frontend.services.windowFocus.focus();
    expect(logic.state.loadSessionState).toEqual("running");
    await vi.waitFor(() =>
      expect(logic.state.loadSessionState).toEqual("success"),
    );

    expect(logic.state.isSignedIn).toEqual(false);
    expect(logic.state.userName).toEqual(null);
  });

  it("should cancel a session check that is in flight when cleanup starts", async () => {
    const { logic, transport } = await setupTest({ skipInitialization: true });
    const held = transport.holdNextRequest();

    const initializeP = logic.initialize();
    await held.reached;
    expect(logic.state.loadSessionState).toEqual("running");

    const cleanupP = logic.cleanup();
    await expect(initializeP).rejects.toBeInstanceOf(
      InitializationCancelledError,
    );
    await cleanupP;

    // State stops changing once cleanup starts, so the cancelled check
    // records neither an outcome nor an error.
    expect(logic.state.loadSessionState).toEqual("running");
    expect(logic.state.loadSessionError).toEqual(null);
    expect(logic.state.isSignedIn).toEqual(false);
  });
});
