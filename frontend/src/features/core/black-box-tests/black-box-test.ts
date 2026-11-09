/* oxlint-disable no-empty-pattern -- Playwright reads the fixtures that a fixture needs from its first parameter, so a fixture that needs none has an empty pattern. */

// The Playwright documentation names the second parameter of a fixture `use`.
// Here it is `provide`, because lint takes `use` for the React hook.

import {
  expect,
  test as base,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { DatabaseTemplate } from "backend/testing";
import { TEST_OWNER_CREDENTIALS } from "../tests/test-owner.js";
import {
  BACKEND_ORIGIN,
  BACKEND_PORT,
  FRONTEND_ORIGIN,
} from "../tests/browser/origins.js";

/** The setup code of the passkey Worker in `legacy/scripts/black-box-serve.mjs`. */
const LEGACY_SETUP_CODE = "black-box-setup-code";
const RESET_PATH = "/api/__black-box/reset";

interface BlackBoxOptions {
  /**
   * Sign the owner in before the test starts. Defaults to true. A test with
   * `false` starts on an instance where passkey sign-in protects the owner
   * pages, and no passkey exists yet.
   */
  authenticated: boolean;
  /**
   * Who can have an account. Defaults to the mode that the project runs in.
   * In `openSignUp` mode, a visitor can sign up, and the owner is one user
   * among others.
   */
  accountMode: "singleOwner" | "openSignUp";
  /**
   * Give the browser of `page` a passkey device, as a phone or a laptop has.
   * It says yes to each passkey request. Defaults to false.
   */
  passkeyDevice: boolean;
}

interface BlackBoxFixtures {
  /** The email, name, and password of the owner account. */
  owner: typeof TEST_OWNER_CREDENTIALS;
  /** The code that saves the first passkey of a new instance. */
  setupCode: string;
  /** A page in a second browser, with no session: a visitor of the app. */
  visitorPage: Page;
}

interface BlackBoxWorkerFixtures {
  databaseTemplate: DatabaseTemplate | null;
}

type Target = "legacy" | "next";

function targetOf(testInfo: Pick<TestInfo, "config">): Target {
  return testInfo.config.metadata["blackBoxTarget"] === "next"
    ? "next"
    : "legacy";
}

function legacyOrigin(input: {
  testInfo: Pick<TestInfo, "config">;
  authenticated: boolean;
}): string {
  const { metadata } = input.testInfo.config;
  return String(
    input.authenticated
      ? metadata["legacyOwnerOrigin"]
      : metadata["legacyPasskeyOrigin"],
  );
}

/**
 * The old app has one database for each Worker, so each test starts with an
 * empty one. The reset route exists only on the black box Workers.
 */
async function resetLegacyApp(input: {
  browser: Browser;
  origin: string;
}): Promise<() => Promise<void>> {
  const context = await input.browser.newContext();
  const reset = await context.request.post(`${input.origin}${RESET_PATH}`);
  await context.close();
  if (!reset.ok()) {
    throw new Error(`The reset of the old app failed: ${reset.status()}`);
  }
  return async () => {};
}

/** A Chromium virtual authenticator that answers as a phone does. */
async function addPasskeyDevice(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("WebAuthn.enable");
  await session.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function startNextBackend(input: {
  page: Page;
  template: DatabaseTemplate;
  authenticated: boolean;
  accountMode: BlackBoxOptions["accountMode"];
}): Promise<() => Promise<void>> {
  const { startTestBackendServer } = await import("backend/testing");
  const server = await startTestBackendServer({
    template: input.template,
    port: BACKEND_PORT,
    trustedOrigins: [FRONTEND_ORIGIN],
    accountMode: input.accountMode,
  });
  if (input.authenticated) {
    // The request shares the page's cookies. Signing in through the API
    // keeps every other test independent of the sign-in page.
    const signIn = await input.page.request.post(
      `${BACKEND_ORIGIN}/api/session`,
      { data: TEST_OWNER_CREDENTIALS },
    );
    if (!signIn.ok()) {
      await server.close();
      throw new Error(`Test owner sign-in failed: ${signIn.status()}`);
    }
  }
  return () => server.close();
}

/**
 * The `test` function of every black box test. Each test gets a backend with a
 * database that holds only the owner, and a page that has not opened the app
 * yet. On the new app that is a backend of its own. On the old app it is an
 * emptied database. Set the options with `test.use()`.
 */
export const test = base.extend<
  BlackBoxOptions & BlackBoxFixtures,
  BlackBoxWorkerFixtures
>({
  authenticated: [true, { option: true }],
  accountMode: ["singleOwner", { option: true }],
  passkeyDevice: [false, { option: true }],
  baseURL: async ({ baseURL, authenticated }, provide, testInfo) => {
    await provide(
      targetOf(testInfo) === "legacy"
        ? legacyOrigin({ testInfo, authenticated })
        : baseURL,
    );
  },
  // Migrating a database and hashing the owner's password takes more than a
  // second, so each worker does it once, and each test database is a copy.
  databaseTemplate: [
    async ({}, provide, workerInfo) => {
      if (targetOf(workerInfo) === "legacy") {
        await provide(null);
        return;
      }
      const { createDatabaseTemplate } = await import("backend/testing");
      await provide(await createDatabaseTemplate(TEST_OWNER_CREDENTIALS));
    },
    { scope: "worker" },
  ],
  owner: async ({}, provide) => {
    await provide(TEST_OWNER_CREDENTIALS);
  },
  setupCode: async ({}, provide) => {
    await provide(LEGACY_SETUP_CODE);
  },
  page: async (
    {
      page,
      browser,
      baseURL,
      databaseTemplate,
      authenticated,
      accountMode,
      passkeyDevice,
    },
    provide,
  ) => {
    if (passkeyDevice) {
      await addPasskeyDevice(page);
    }
    const closeBackend = databaseTemplate
      ? await startNextBackend({
          page,
          template: databaseTemplate,
          authenticated,
          accountMode,
        })
      : await resetLegacyApp({ browser, origin: baseURL ?? "" });
    const uncaughtErrors: Error[] = [];
    page.on("pageerror", (error) => uncaughtErrors.push(error));

    await provide(page);

    // Closing the backend ends the page's open requests, and an error from
    // that is not part of the test.
    const errorsDuringTest = [...uncaughtErrors];
    await closeBackend();
    expect(
      errorsDuringTest,
      "Normal use must not cause an error that no code caught",
    ).toEqual([]);
  },
  visitorPage: async ({ browser, baseURL, page }, provide) => {
    // `page` first, so that the visitor sees the same backend.
    void page;
    const context = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      timezoneId: "UTC",
    });
    const visitor = await context.newPage();
    await provide(visitor);
    await context.close();
  },
});
