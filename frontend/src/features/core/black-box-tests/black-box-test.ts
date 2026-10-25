/* oxlint-disable no-empty-pattern -- Playwright reads the fixtures that a fixture needs from its first parameter, so a fixture that needs none has an empty pattern. */

// The Playwright documentation names the second parameter of a fixture `use`.
// Here it is `provide`, because lint takes `use` for the React hook.

import { expect, test as base } from "@playwright/test";
import {
  createDatabaseTemplate,
  startTestBackendServer,
  type DatabaseTemplate,
} from "backend/testing";
import { TEST_OWNER_CREDENTIALS } from "../tests/test-owner.js";
import {
  BACKEND_ORIGIN,
  BACKEND_PORT,
  FRONTEND_ORIGIN,
} from "../tests/browser/origins.js";

interface BlackBoxOptions {
  /** Sign the owner in before the test starts. Defaults to true. */
  authenticated: boolean;
  /**
   * Who can have an account. Defaults to the mode that the project runs in.
   * In `openSignUp` mode, a visitor can sign up, and the owner is one user
   * among others.
   */
  accountMode: "singleOwner" | "openSignUp";
}

interface BlackBoxFixtures {
  /** The email, name, and password of the owner account. */
  owner: typeof TEST_OWNER_CREDENTIALS;
}

interface BlackBoxWorkerFixtures {
  databaseTemplate: DatabaseTemplate;
}

/**
 * The `test` function of every black box test. Each test gets its own
 * backend, with a database that holds only the owner account, and a page that
 * has not opened the app yet. Set the options with `test.use()`.
 */
export const test = base.extend<
  BlackBoxOptions & BlackBoxFixtures,
  BlackBoxWorkerFixtures
>({
  authenticated: [true, { option: true }],
  accountMode: ["singleOwner", { option: true }],
  // Migrating a database and hashing the owner's password takes more than a
  // second, so each worker does it once, and each test database is a copy.
  databaseTemplate: [
    async ({}, provide) => {
      await provide(await createDatabaseTemplate(TEST_OWNER_CREDENTIALS));
    },
    { scope: "worker" },
  ],
  owner: async ({}, provide) => {
    await provide(TEST_OWNER_CREDENTIALS);
  },
  page: async (
    { page, databaseTemplate, authenticated, accountMode },
    provide,
  ) => {
    const server = await startTestBackendServer({
      template: databaseTemplate,
      port: BACKEND_PORT,
      trustedOrigins: [FRONTEND_ORIGIN],
      accountMode,
    });
    const uncaughtErrors: Error[] = [];
    page.on("pageerror", (error) => uncaughtErrors.push(error));
    if (authenticated) {
      // The request shares the page's cookies. Signing in through the API
      // keeps every other test independent of the sign-in page.
      const signIn = await page.request.post(`${BACKEND_ORIGIN}/api/session`, {
        data: TEST_OWNER_CREDENTIALS,
      });
      if (!signIn.ok()) {
        await server.close();
        throw new Error(`Test owner sign-in failed: ${signIn.status()}`);
      }
    }

    await provide(page);

    // Closing the backend ends the page's open requests, and an error from
    // that is not part of the test.
    const errorsDuringTest = [...uncaughtErrors];
    await server.close();
    expect(
      errorsDuringTest,
      "Normal use must not cause an error that no code caught",
    ).toEqual([]);
  },
});
